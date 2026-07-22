import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  Badge,
  BrandProvider,
  Button,
  Card,
  Checkbox,
  Dialog,
  Input,
  PaymentButton,
} from "../../packages/design-system/src/index";
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
        <h1>@acme/design-system — the M5 catalog</h1>
        <p>
          Six generated components plus one governed extension. Brand:{" "}
          <strong>{brand}</strong>
        </p>
        <label className="toggle">
          <Checkbox
            size="sm"
            checked={brand === "seller"}
            onChange={(event) =>
              setBrand(event.target.checked ? "seller" : "marketplace")
            }
          />
          Seller brand
        </label>

        <Card>
          <h2>
            Button <Badge tone="primary">6 variants</Badge>
          </h2>
          <table>
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
          <div className="row">
            <Button loading>Saving…</Button>
            <Button disabled>Disabled</Button>
            <PaymentButton size="lg">Pay $49</PaymentButton>
          </div>
        </Card>

        <Card>
          <h2>
            Form controls <Badge>input · checkbox</Badge>
          </h2>
          <div className="row">
            <Input size="sm" placeholder="Small" />
            <Input size="md" placeholder="Medium" />
            <Input size="md" placeholder="Disabled" disabled />
          </div>
          <div className="row">
            <label className="toggle">
              <Checkbox defaultChecked /> Checked
            </label>
            <label className="toggle">
              <Checkbox /> Unchecked
            </label>
            <label className="toggle">
              <Checkbox defaultChecked disabled /> Disabled
            </label>
          </div>
        </Card>

        <Card>
          <h2>
            Dialog <Badge tone="danger">Base UI</Badge>
          </h2>
          <Dialog.Root>
            <Dialog.Trigger render={<Button variant="secondary" />}>
              Delete workspace…
            </Dialog.Trigger>
            <Dialog.Popup size="sm">
              <Dialog.Title>Delete workspace?</Dialog.Title>
              <Dialog.Description>
                This removes every token, brand, and contract. The action cannot
                be undone.
              </Dialog.Description>
              <div className="row">
                <Dialog.Close render={<Button variant="danger" />}>
                  Delete
                </Dialog.Close>
                <Dialog.Close render={<Button variant="secondary" />}>
                  Cancel
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Root>
        </Card>
      </main>
    </BrandProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
