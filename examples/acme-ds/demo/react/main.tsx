import { createRoot } from "react-dom/client";
import { useState } from "react";
import { BrandProvider, Button } from "../../packages/design-system/src/index";
import type {
  ButtonSize,
  ButtonVariant,
} from "../../packages/design-system/src/Button";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "danger"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

function App() {
  const [brand, setBrand] = useState<"marketplace" | "seller">("marketplace");

  return (
    <BrandProvider brand={brand}>
      <main className="page">
        <h1>@acme/design-system — generated Button</h1>
        <p>
          Every cell below is the same generated component; the matrix is
          variants × sizes from <code>button.spec.ts</code>. Brand:{" "}
          <strong>{brand}</strong>
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={brand === "seller"}
            onChange={(event) =>
              setBrand(event.target.checked ? "seller" : "marketplace")
            }
          />
          Seller brand
        </label>

        <table>
          <thead>
            <tr>
              <th />
              {SIZES.map((size) => (
                <th key={size}>{size}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VARIANTS.map((variant) => (
              <tr key={variant}>
                <th>{variant}</th>
                {SIZES.map((size) => (
                  <td key={size}>
                    <Button variant={variant} size={size}>
                      Save
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h2>States</h2>
        <div className="row">
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
          <Button variant="danger" loading>
            Deleting…
          </Button>
        </div>
      </main>
    </BrandProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
