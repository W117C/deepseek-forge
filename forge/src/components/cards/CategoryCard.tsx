import { Link } from "react-router-dom";
import type { Category } from "../../types";
import { CategoryIcon } from "../icons";

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link to={"/explore?cat=" + category.name} className="cat-card">
      <div className="cat-card-head">
        <span className="cat-icon">
          <CategoryIcon icon={category.icon} />
        </span>
        <span className="cat-count">{category.count} packages</span>
      </div>
      <div>
        <h3>{category.name}</h3>
        <p>{category.description}</p>
      </div>
    </Link>
  );
}
