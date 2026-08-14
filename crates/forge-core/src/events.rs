//! Event system (target-state §20): a typed event enum + an in-memory bus.

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

/// Events emitted by Forge Core.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ForgeEvent {
    PackageInstallStarted {
        package_id: String,
    },
    PackageInstallProgress {
        package_id: String,
        step: String,
        percent: u8,
    },
    PackageInstallCompleted {
        package_id: String,
        version: String,
    },
    PackageInstallFailed {
        package_id: String,
        code: String,
    },
    PackageSecurityStarted {
        package_id: String,
    },
    PackageSecurityCompleted {
        package_id: String,
        status: String,
    },
    RuntimeStarted {
        session_id: String,
    },
    RuntimeStopped {
        session_id: String,
        exit_code: Option<i32>,
    },
    RuntimeError {
        session_id: String,
        message: String,
    },
}

/// In-memory fan-out bus. Each [subscribe](EventBus::subscribe) call opens a fresh
/// channel, so every subscriber receives a copy of each published event.
///
/// `std::sync::mpsc` has no multi-consumer `Sender::subscribe`, so the bus keeps a
/// list of senders — one per subscription — and publishes to all of them.
#[derive(Clone, Debug, Default)]
pub struct EventBus {
    senders: Arc<Mutex<Vec<Sender<ForgeEvent>>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self::default()
    }

    /// Broadcast an event to every active subscriber.
    pub fn publish(&self, event: ForgeEvent) {
        let mut senders = match self.senders.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        senders.retain(|tx| tx.send(event.clone()).is_ok());
    }

    /// Open a new subscription channel.
    pub fn subscribe(&self) -> Receiver<ForgeEvent> {
        let (tx, rx) = channel();
        match self.senders.lock() {
            Ok(mut guard) => guard.push(tx),
            Err(poisoned) => poisoned.into_inner().push(tx),
        }
        rx
    }
}
