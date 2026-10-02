"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { obterLinksDocumentos, type Documento } from "@/app/admin/accoes";

const tamanhoLegivel = (bytes: number | null) =>
  bytes === null ? "" : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Lista os documentos do candidato com pré-visualização e descarga.
 * Os links são assinados e válidos por 1 hora; há um botão para os renovar
 * quando a ficha fica aberta muito tempo.
 */
export function DocumentosCandidato({ id }: { id: string }) {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  async function carregar() {
    setACarregar(true);
    const r = await obterLinksDocumentos(id);
    if (r.ok) {
      setDocumentos(r.documentos);
      setErro(null);
    } else {
      setDocumentos([]);
      setErro(r.mensagem ?? "Não foi possível preparar os documentos.");
    }
    setACarregar(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function baixarTodos() {
    if (!documentos?.length) return;
    documentos.forEach((d, i) =>
      setTimeout(() => window.open(d.urlBaixar, "_blank", "noopener"), i * 400)
    );
    toast.success(`${documentos.length} documento(s) a descarregar.`);
  }

  if (aCarregar) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-white p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        A preparar os documentos…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">{erro}</p>
        <Button variant="outline" size="sm" onClick={carregar}>
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {documentos?.map((d) => {
          const eImagem = ["jpg", "jpeg", "png"].includes(d.extensao);
          const Icone = eImagem ? ImageIcon : FileText;

          return (
            <div key={d.chave} className="rounded-lg border bg-white p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100">
                  <Icone className="h-4 w-4 text-slate-600" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.etiqueta}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.extensao.toUpperCase()}
                    {d.tamanho !== null && ` · ${tamanhoLegivel(d.tamanho)}`}
                  </p>
                </div>
              </div>

              {/* Miniatura, quando o documento é uma imagem */}
              {eImagem && (
                <a href={d.urlVer} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={d.urlVer}
                    alt={d.etiqueta}
                    className="h-36 w-full rounded-md border bg-slate-50 object-contain"
                  />
                </a>
              )}

              <div className="mt-3 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <a href={d.urlVer} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4" />
                    Ver
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <a href={d.urlBaixar}>
                    <Download className="h-4 w-4" />
                    Baixar
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={baixarTodos}>
          <Download className="h-4 w-4" />
          Baixar todos ({documentos?.length ?? 0})
        </Button>
        <Button variant="ghost" size="sm" onClick={carregar}>
          <RefreshCw className="h-4 w-4" />
          Renovar links
        </Button>
        <p className="text-xs text-muted-foreground">Os links expiram ao fim de 1 hora.</p>
      </div>
    </div>
  );
}
