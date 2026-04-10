"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDERS = [
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o", needsKey: true, needsUrl: false },
  { value: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-5-20251001", needsKey: true, needsUrl: false },
  { value: "gemini", label: "Google Gemini", defaultModel: "gemini-2.0-flash", needsKey: true, needsUrl: false },
  { value: "openrouter", label: "OpenRouter", defaultModel: "meta-llama/llama-3.3-70b-instruct", needsKey: true, needsUrl: false },
  { value: "ollama", label: "Ollama (lokal)", defaultModel: "llama3.2", needsKey: false, needsUrl: true },
];

type Provider = {
  id: string;
  provider: string;
  displayName: string;
  apiKey: string | null;
  baseUrl: string | null;
  modelId: string;
  isActive: boolean;
  isDefault: boolean;
};

type FormState = {
  provider: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  modelId: string;
  isActive: boolean;
  isDefault: boolean;
};

const empty: FormState = {
  provider: "openai", displayName: "", apiKey: "",
  baseUrl: "", modelId: "gpt-4o", isActive: false, isDefault: false,
};

export default function AiConfigPage() {
  const [items, setItems] = useState<Provider[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/ai-providers").then((r) => r.json()).then(setItems);

  useEffect(() => { load(); }, []);

  const selectedProviderMeta = PROVIDERS.find((p) => p.value === form.provider);

  const openCreate = () => { setForm(empty); setEditId(null); setShowForm(true); };
  const openEdit = (item: Provider) => {
    setForm({
      provider: item.provider, displayName: item.displayName,
      apiKey: "", baseUrl: item.baseUrl ?? "",
      modelId: item.modelId, isActive: item.isActive, isDefault: item.isDefault,
    });
    setEditId(item.id);
    setShowForm(true);
  };

  const handleProviderChange = (v: string) => {
    const meta = PROVIDERS.find((p) => p.value === v);
    setForm((f) => ({
      ...f,
      provider: v,
      displayName: meta?.label ?? v,
      modelId: meta?.defaultModel ?? "",
      baseUrl: v === "ollama" ? "http://localhost:11434" : "",
    }));
  };

  const save = async () => {
    setSaving(true);
    const url = editId ? `/api/admin/ai-providers/${editId}` : "/api/admin/ai-providers";
    const body: Partial<FormState> = { ...form };
    if (!body.apiKey) delete body.apiKey;
    await fetch(url, {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setShowForm(false);
    setSaving(false);
  };

  const remove = async (item: Provider) => {
    if (!confirm(`"${item.displayName}" wirklich loeschen?`)) return;
    setDeleting(item.id);
    await fetch(`/api/admin/ai-providers/${item.id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  };

  const providerLabel = (v: string) => PROVIDERS.find((p) => p.value === v)?.label ?? v;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface">AI Provider</h2>
          <p className="text-sm text-on-surface-variant">Konfiguriere AI-Anbieter fuer den Coach</p>
        </div>
        <Button onClick={openCreate}>+ Neu</Button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl bg-surface-container p-6">
          <h3 className="mb-4 font-headline text-lg font-semibold text-on-surface">
            {editId ? "Bearbeiten" : "Provider hinzufuegen"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {!editId && (
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full rounded-md bg-surface-container-highest px-4 py-3 text-sm text-on-surface border-0 outline-none focus:bg-surface-bright transition-all"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
            <Input
              label="Anzeigename"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            <Input
              label="Modell ID"
              placeholder={selectedProviderMeta?.defaultModel}
              value={form.modelId}
              onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
            />
            {selectedProviderMeta?.needsKey && (
              <div className="col-span-2">
                <Input
                  label={editId ? "API Key (leer lassen um nicht zu aendern)" : "API Key"}
                  type="password"
                  placeholder="sk-..."
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
              </div>
            )}
            {(selectedProviderMeta?.needsUrl || form.provider === "ollama") && (
              <div className="col-span-2">
                <Input
                  label="Base URL"
                  placeholder="http://localhost:11434"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </div>
            )}
            <div className="col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-primary" />
                Aktiv
              </label>
              <label className="flex items-center gap-2 text-sm text-on-surface">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="accent-primary" />
                Standard-Provider
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
            <Button isLoading={saving} onClick={save}>Speichern</Button>
          </div>
        </div>
      )}

      <DataTable
        data={items}
        onEdit={openEdit}
        onDelete={remove}
        isDeleting={deleting}
        columns={[
          { key: "displayName", label: "Name" },
          { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
          { key: "modelId", label: "Modell" },
          {
            key: "isActive", label: "Status",
            render: (r) => (
              <div className="flex gap-2">
                {r.isActive && <span className="text-secondary text-xs font-medium">Aktiv</span>}
                {r.isDefault && <span className="text-primary text-xs font-medium">Standard</span>}
                {!r.isActive && !r.isDefault && <span className="text-on-surface-variant text-xs">Inaktiv</span>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
