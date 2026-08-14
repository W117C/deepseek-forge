import AgentBundles from '../components/AgentBundles'
import BundleArchitecture from '../components/BundleArchitecture'
import Ecosystem from '../components/Ecosystem'
import FinalCTA from '../components/FinalCTA'
import Footer from '../components/Footer'
import Header from '../components/Header'
import Hero from '../components/Hero'
import HowItWorks from '../components/HowItWorks'
import OpenSource from '../components/OpenSource'
import Problem from '../components/Problem'
import Security from '../components/Security'
import Solution from '../components/Solution'
import UseCases from '../components/UseCases'
import WhyForge from '../components/WhyForge'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <AgentBundles />
        <HowItWorks />
        <BundleArchitecture />
        <UseCases />
        <Ecosystem />
        <WhyForge />
        <Security />
        <OpenSource />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
