"use client";

import { useEffect, useRef } from "react";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Bold,
  Code2,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Table2,
  Trash2,
} from "lucide-react";

interface RichTextEditorProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export function RichTextEditor({
  label,
  value,
  placeholder,
  onChange,
}: RichTextEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rich-content",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, {
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  const openImagePicker = () => inputRef.current?.click();

  const handleImagePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !editor) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
    event.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold tracking-[0.18em] text-muted uppercase">{label}</p>
        <p className="text-xs text-muted">Images, tables, and code blocks supported.</p>
      </div>
      <div className="editor-shell">
        <div className="editor-toolbar">
          <ToolbarButton
            active={editor?.isActive("bold")}
            icon={<Bold className="size-4" />}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            active={editor?.isActive("italic")}
            icon={<Italic className="size-4" />}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            active={editor?.isActive("heading", { level: 2 })}
            icon={<Heading2 className="size-4" />}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            active={editor?.isActive("paragraph")}
            icon={<Pilcrow className="size-4" />}
            onClick={() => editor?.chain().focus().setParagraph().run()}
          />
          <ToolbarButton
            active={editor?.isActive("bulletList")}
            icon={<List className="size-4" />}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            active={editor?.isActive("orderedList")}
            icon={<ListOrdered className="size-4" />}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            active={editor?.isActive("blockquote")}
            icon={<Quote className="size-4" />}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            active={editor?.isActive("codeBlock")}
            icon={<Code2 className="size-4" />}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          />
          <ToolbarButton
            icon={<Table2 className="size-4" />}
            onClick={() =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
            }
          />
          <ToolbarButton icon={<Trash2 className="size-4" />} onClick={() => editor?.chain().focus().deleteTable().run()} />
          <ToolbarButton icon={<ImagePlus className="size-4" />} onClick={openImagePicker} />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  icon,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" data-active={active ? "true" : "false"} onClick={onClick}>
      {icon}
    </button>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
