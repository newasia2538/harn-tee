// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemEditor } from "../../components/harn-tee/item-editor";
import type { ItemDraft, ParticipantDraft, ReceiptOcrItem } from "../../lib/harn-tee/types";

const participants: ParticipantDraft[] = [
  { id: "person-a", name: "เอ", order: 0 },
  { id: "person-b", name: "บี", order: 1 },
];

const items: ItemDraft[] = [{
  id: "item-1",
  name: "ข้าว",
  priceSatang: 5000,
  payerIds: ["person-a", "person-b"],
  vatPercent: 7,
  serviceChargePercent: 10,
  order: 0,
}];

afterEach(cleanup);

describe("ItemEditor receipt scanner entry point", () => {
  it("retains controlled unfinished numeric input after blur",()=>{
    const change=vi.fn();render(<ItemEditor items={items} participants={participants} feeMode="item" onChange={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} numbers={{prices:{"item-1":"7."},itemVat:{"item-1":""},itemService:{}}} onNumericChange={change}/>);
    const price=screen.getByLabelText("ราคาของรายการที่ 1") as HTMLInputElement;fireEvent.blur(price);expect(price.value).toBe("7.");
    fireEvent.change(price,{target:{value:"7.5"}});expect(change).toHaveBeenCalledWith({kind:"price",itemId:"item-1"},"7.5");
  });
  it("renders scan and manual actions without removing item fee controls", () => {
    const onImport = vi.fn<(items: ReceiptOcrItem[]) => void>();

    render(
      <ItemEditor
        items={items}
        participants={participants}
        feeMode="item"
        onChange={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onImport={onImport}
      />,
    );

    expect(screen.getByRole("button", { name: "ถ่ายรูปใบเสร็จ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "เพิ่มรายการสินค้า" })).toBeTruthy();
    expect(screen.getByText("VAT รายการนี้")).toBeTruthy();
    expect(screen.getByText("Service charge รายการนี้")).toBeTruthy();
  });
});
