import { TAMANHO_MAXIMO_FICHEIRO } from "@/lib/constantes";

/**
 * Reduz uma imagem no próprio browser até caber no limite de tamanho.
 *
 * Sem isto, o limite de 300 KB deixava de fora quase toda a gente: uma foto do
 * BI tirada com telemóvel anda pelos 2 a 5 MB. Aqui a foto é redimensionada e
 * recomprimida antes de sair do telefone do candidato.
 *
 * Só funciona com imagens. PDFs não se comprimem no browser - esses têm mesmo
 * de vir já dentro do limite.
 */
export async function comprimirImagem(ficheiro: File): Promise<File> {
  if (!ficheiro.type.startsWith("image/")) return ficheiro;
  if (ficheiro.size <= TAMANHO_MAXIMO_FICHEIRO) return ficheiro;

  const bitmap = await carregarImagem(ficheiro);

  // Vamos tentando com menos resolução e menos qualidade até caber.
  const largurasMaximas = [2000, 1600, 1280, 1024, 800];
  const qualidades = [0.82, 0.7, 0.6, 0.5, 0.4];

  for (const largura of largurasMaximas) {
    for (const qualidade of qualidades) {
      const blob = await desenhar(bitmap, largura, qualidade);
      if (blob && blob.size <= TAMANHO_MAXIMO_FICHEIRO) {
        const nome = ficheiro.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() });
      }
    }
  }

  // Não conseguimos: devolvemos o original e a validação encarrega-se de avisar.
  return ficheiro;
}

function carregarImagem(ficheiro: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(ficheiro);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui ler a imagem."));
    };
    img.src = url;
  });
}

function desenhar(
  img: HTMLImageElement,
  larguraMaxima: number,
  qualidade: number
): Promise<Blob | null> {
  const escala = Math.min(1, larguraMaxima / img.width);
  const largura = Math.round(img.width * escala);
  const altura = Math.round(img.height * escala);

  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;

  const ctx = tela.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  // Fundo branco: PNGs com transparência ficariam pretos ao passar a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(img, 0, 0, largura, altura);

  return new Promise((resolve) => tela.toBlob(resolve, "image/jpeg", qualidade));
}
