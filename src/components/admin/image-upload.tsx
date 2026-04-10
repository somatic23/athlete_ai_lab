"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  folder: string;
}

export function ImageUpload({ value, onChange, folder }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const { url } = await res.json();
      onChange(url);
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">
        Bild
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex h-32 w-32 cursor-pointer items-center justify-center rounded-lg bg-surface-container-high transition-colors hover:bg-surface-container-highest",
          uploading && "opacity-50"
        )}
      >
        {value ? (
          <Image
            src={value}
            alt="Upload preview"
            fill
            className="rounded-lg object-cover"
          />
        ) : (
          <span className="text-xs text-on-surface-variant">
            {uploading ? "Hochladen..." : "+ Bild"}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
