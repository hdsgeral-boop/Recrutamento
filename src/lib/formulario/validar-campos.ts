import type { CampoFormulario, ResultadoValidacaoCampos } from "@/types/formulario";

/**
 * ===========================================================================
 * VALIDADOR DINÂMICO DE CAMPOS DE FORMULÁRIO
 * ---------------------------------------------------------------------------
 * Função pura que valida e normaliza as respostas de um candidato aos campos
 * configurados para o respectivo concurso.
 * ===========================================================================
 */
export function validarCamposDinamicos(
  campos: CampoFormulario[],
  respostas: Record<string, unknown>
): ResultadoValidacaoCampos {
  const erros: Record<string, string> = {};
  const valores: Record<string, unknown> = {};

  for (const campo of campos) {
    const bruto = respostas[campo.chave];

    // 1. Campo obrigatório em falta
    const estaVazio =
      bruto === undefined ||
      bruto === null ||
      (typeof bruto === "string" && bruto.trim() === "");

    if (campo.obrigatorio && estaVazio) {
      erros[campo.chave] =
        campo.tipo === "sim_nao" || campo.tipo === "booleano"
          ? "Escolhe Sim ou Não."
          : campo.tipo === "seleccao"
          ? "Selecciona uma das opções."
          : "Campo obrigatório.";
      continue;
    }

    if (estaVazio) {
      valores[campo.chave] = null;
      continue;
    }

    // 2. Validação por tipo
    switch (campo.tipo) {
      case "sim_nao": {
        if (bruto === "sim" || bruto === true) {
          valores[campo.chave] = true;
        } else if (bruto === "nao" || bruto === false) {
          valores[campo.chave] = false;
        } else {
          erros[campo.chave] = "Escolhe Sim ou Não.";
        }
        break;
      }

      case "booleano": {
        valores[campo.chave] = Boolean(bruto);
        break;
      }

      case "numero": {
        const num = Number(bruto);
        if (Number.isNaN(num) || !Number.isFinite(num)) {
          erros[campo.chave] = "Escreve um número válido.";
        } else {
          valores[campo.chave] = num;
        }
        break;
      }

      case "seleccao": {
        const str = String(bruto).trim();
        const permitidas = campo.opcoes ?? [];
        if (permitidas.length > 0 && !permitidas.includes(str)) {
          erros[campo.chave] = "A opção escolhida não é válida.";
        } else {
          valores[campo.chave] = str;
        }
        break;
      }

      case "texto":
      default: {
        const str = String(bruto).trim();
        if (str.length > 500) {
          erros[campo.chave] = "Texto demasiado longo (máximo 500 caracteres).";
        } else {
          valores[campo.chave] = str;
        }
        break;
      }
    }
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    valores,
  };
}
