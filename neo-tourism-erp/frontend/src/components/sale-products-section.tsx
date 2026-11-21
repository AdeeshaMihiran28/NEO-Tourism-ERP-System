"use client";

import { useEffect, useState, type ClipboardEvent, type FormEvent } from "react";
import { apiDownload, apiFetch, ApiError } from "@/lib/api/client";
import type {
  SaleProductCategory,
  SaleProductReferenceType,
  SaleSubmissionProduct,
} from "@/types/sale";

interface SupplierOption {
  id: string;
  name: string;
  supplierType: string;
}

interface ProductFields {
  category: SaleProductCategory;
  description: string;
  supplierId: string;
  estimatedSupplierCost: string;
  pnrText: string;
  notes: string;
  references: Array<{ type: SaleProductReferenceType; value: string }>;
}

const categories: SaleProductCategory[] = [
  "INTERNATIONAL_FLIGHT",
  "BUDGET_CARRIER",
  "HOTEL",
  "TRANSFER",
  "TOUR",
];

const referenceTypes: SaleProductReferenceType[] = [
  "PNR",
  "SUPPLIER_BOOKING_REFERENCE",
  "AIRLINE_REFERENCE",
  "HOTEL_REFERENCE",
  "IV_REFERENCE",
  "AMADEUS_REFERENCE",
  "OTHER",
];

const emptyFields: ProductFields = {
  category: "INTERNATIONAL_FLIGHT",
  description: "",
  supplierId: "",
  estimatedSupplierCost: "",
  pnrText: "",
  notes: "",
  references: [],
};

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function productFields(product: SaleSubmissionProduct): ProductFields {
  return {
    category: product.category,
    description: product.description,
    supplierId: product.supplierId ?? "",
    estimatedSupplierCost: product.estimatedSupplierCost ?? "",
    pnrText: product.pnrText ?? "",
    notes: product.notes ?? "",
    references: product.references.map(({ type, value }) => ({ type, value })),
  };
}

export function SaleProductsSection({
  submissionId,
  products,
  currency,
  canEdit,
  onReload,
}: {
  submissionId: string;
  products: SaleSubmissionProduct[];
  currency: string;
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<ProductFields>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    apiFetch<SupplierOption[]>("/sale-submissions/suppliers")
      .then(setSuppliers)
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "Unable to load suppliers."),
      );
  }, [canEdit]);

  const total = products.reduce(
    (sum, product) => sum + Number(product.estimatedSupplierCost ?? 0),
    0,
  );

  function startCreate() {
    setEditingId("new");
    setFields(emptyFields);
    setError("");
  }

  function startEdit(product: SaleSubmissionProduct) {
    setEditingId(product.id);
    setFields(productFields(product));
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path =
        editingId === "new"
          ? `/sale-submissions/${submissionId}/products`
          : `/sale-submissions/${submissionId}/products/${editingId}`;
      await apiFetch(path, {
        method: editingId === "new" ? "POST" : "PATCH",
        body: JSON.stringify({
          ...fields,
          supplierId: fields.supplierId || null,
          estimatedSupplierCost: fields.estimatedSupplierCost || null,
          pnrText: fields.pnrText || null,
          notes: fields.notes || null,
          references: fields.references.filter((reference) => reference.value.trim()),
        }),
      });
      setEditingId(null);
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save product.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(productId: string) {
    if (!window.confirm("Remove this draft product and its attachments?")) return;
    setBusy(true);
    try {
      await apiFetch(`/sale-submissions/${submissionId}/products/${productId}`, {
        method: "DELETE",
      });
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to remove product.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(productId: string, files: File[]) {
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const data = new FormData();
        data.append("file", file);
        await apiFetch(`/sale-submissions/${submissionId}/products/${productId}/attachments`, {
          method: "POST",
          body: data,
        });
      }
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to upload screenshot.");
    } finally {
      setBusy(false);
    }
  }

  function paste(productId: string, event: ClipboardEvent<HTMLElement>) {
    if (!canEdit) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) {
      event.preventDefault();
      void upload(productId, files);
    }
  }

  async function viewAttachment(productId: string, attachmentId: string) {
    try {
      const blob = await apiDownload(
        `/sale-submissions/${submissionId}/products/${productId}/attachments/${attachmentId}`,
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to view attachment.");
    }
  }

  async function removeAttachment(productId: string, attachmentId: string) {
    setBusy(true);
    try {
      await apiFetch(
        `/sale-submissions/${submissionId}/products/${productId}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      await onReload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to remove attachment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Product Breakdown</h2>
          <p className="mt-1 text-sm text-slate-600">
            {products.length} product{products.length === 1 ? "" : "s"} · Estimated supplier total {currency} {total.toFixed(2)}
          </p>
        </div>
        {canEdit && !editingId && (
          <button type="button" onClick={startCreate} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">
            Add product
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {editingId && (
        <form onSubmit={save} className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Category
              <select value={fields.category} onChange={(event) => setFields({ ...fields, category: event.target.value as SaleProductCategory })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                {categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Supplier
              <select value={fields.supplierId} onChange={(event) => setFields({ ...fields, supplierId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {label(supplier.supplierType)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description / travel details
              <textarea required rows={3} value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Estimated supplier cost ({currency})
              <input type="number" min="0" step="0.01" value={fields.estimatedSupplierCost} onChange={(event) => setFields({ ...fields, estimatedSupplierCost: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Product notes
              <input value={fields.notes} onChange={(event) => setFields({ ...fields, notes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">PNR / itinerary text
              <textarea rows={6} value={fields.pnrText} onChange={(event) => setFields({ ...fields, pnrText: event.target.value })} className="mt-1.5 w-full whitespace-pre-wrap rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm" />
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">References</h3>
              <button type="button" onClick={() => setFields({ ...fields, references: [...fields.references, { type: "PNR", value: "" }] })} className="text-sm font-semibold text-cyan-700">Add reference</button>
            </div>
            {fields.references.map((reference, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[13rem_1fr_auto]">
                <select value={reference.type} onChange={(event) => setFields({ ...fields, references: fields.references.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as SaleProductReferenceType } : item) })} className="rounded-xl border border-slate-300 bg-white px-3 py-2">
                  {referenceTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}
                </select>
                <input value={reference.value} onChange={(event) => setFields({ ...fields, references: fields.references.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} className="rounded-xl border border-slate-300 bg-white px-3 py-2" />
                <button type="button" aria-label="Remove reference" onClick={() => setFields({ ...fields, references: fields.references.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl border border-red-200 px-3 text-red-700">Remove</button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
            <button disabled={busy} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save product</button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-4">
        {products.map((product) => (
          <article key={product.id} onPaste={(event) => paste(product.id, event)} tabIndex={canEdit ? 0 : undefined} className="rounded-xl border border-slate-200 p-4 focus:border-cyan-500 focus:outline-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">{label(product.category)}</p>
                <h3 className="mt-1 font-semibold text-slate-950">{product.description}</h3>
                <p className="mt-1 text-sm text-slate-600">{product.supplier?.name ?? "Supplier not selected"} · {currency} {Number(product.estimatedSupplierCost ?? 0).toFixed(2)}</p>
              </div>
              {canEdit && <div className="flex gap-2"><button type="button" onClick={() => startEdit(product)} className="text-sm font-semibold text-cyan-700">Edit</button><button type="button" onClick={() => void removeProduct(product.id)} className="text-sm font-semibold text-red-700">Remove</button></div>}
            </div>
            {product.pnrText && <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{product.pnrText}</pre>}
            {product.notes && <p className="mt-3 text-sm text-slate-700">{product.notes}</p>}
            {product.references.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{product.references.map((reference) => <span key={reference.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{label(reference.type)}: {reference.value}</span>)}</div>}

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Screenshots</span>
                {product.attachments.map((attachment) => (
                  <span key={attachment.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                    <button type="button" onClick={() => void viewAttachment(product.id, attachment.id)} className="font-semibold text-cyan-700">{attachment.fileName}</button>
                    {canEdit && <button type="button" aria-label={`Remove ${attachment.fileName}`} onClick={() => void removeAttachment(product.id, attachment.id)} className="text-red-700">×</button>}
                  </span>
                ))}
                {canEdit && <label className="cursor-pointer text-xs font-semibold text-cyan-700">Upload
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void upload(product.id, Array.from(event.target.files ?? []))} />
                </label>}
              </div>
              {canEdit && <p className="mt-2 text-xs text-slate-500">Focus this product and paste a screenshot, or upload JPEG, PNG or WebP files up to 5 MB each.</p>}
            </div>
          </article>
        ))}
        {!products.length && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">No products added yet.</p>}
      </div>
    </section>
  );
}
