import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * ===========================================================================
 * TESTE DE ISOLAMENTO MULTI-CONCURSO (RLS E REGRAS DE ATRAVESSAMENTO)
 * ---------------------------------------------------------------------------
 * Prova formalmente as invariantes do isolamento por linha:
 *  1. Uma consulta no Concurso A NUNCA devolve linhas do Concurso B.
 *  2. Uma tentativa de escrita no Concurso B a partir do Concurso A é BARRADA.
 *  3. O mesmo candidato (mesmo BI) consegue concorrer a dois concursos distintos.
 *  4. Duas entrevistas na Sala 1 à mesma hora coexistem se forem de concursos distintos.
 * ===========================================================================
 */

interface CandidatoSimulado {
  id: string;
  concurso_id: string;
  nome: string;
  bi: string;
  email: string;
}

interface EntrevistaSimulada {
  id: string;
  concurso_id: string;
  sala: number;
  inicio: string;
}

class TabelaSimuladaComRLS<T extends { id: string; concurso_id: string }> {
  private linhas: T[] = [];

  inserir(linha: T, concursoActual: string | null): T {
    // Regra WITH CHECK: o registo inserido TEM de ter o concurso_id igual ao concurso_actual
    if (linha.concurso_id !== concursoActual) {
      throw new Error(`RLS WITH CHECK VIOLATION: tentativa de gravar em concurso alheio (${linha.concurso_id} != ${concursoActual})`);
    }
    this.linhas.push(linha);
    return linha;
  }

  consultar(concursoActual: string | null): T[] {
    // Regra USING: apenas devolve linhas onde concurso_id = concurso_actual
    if (!concursoActual) return [];
    return this.linhas.filter((l) => l.concurso_id === concursoActual);
  }

  actualizar(id: string, novosDados: Partial<T>, concursoActual: string | null): boolean {
    const idx = this.linhas.findIndex((l) => l.id === id && l.concurso_id === concursoActual);
    if (idx === -1) return false; // Invisível para o concurso actual (USING)

    const novaLinha = { ...this.linhas[idx], ...novosDados };
    if (novaLinha.concurso_id !== concursoActual) {
      throw new Error("RLS WITH CHECK VIOLATION: não é permitido transferir registo para outro concurso");
    }

    this.linhas[idx] = novaLinha;
    return true;
  }
}

test("RLS: consulta no Concurso A não vê candidatos do Concurso B", () => {
  const tabela = new TabelaSimuladaComRLS<CandidatoSimulado>();
  const CONCURSO_BENGO = "concurso-uuid-bengo";
  const CONCURSO_UGP = "concurso-uuid-ugp";

  // Inserir candidato no Bengo
  tabela.inserir(
    { id: "c1", concurso_id: CONCURSO_BENGO, nome: "Manuel Bengo", bi: "001LA01", email: "manuel@bengo.ao" },
    CONCURSO_BENGO
  );

  // Inserir candidato na UGP
  tabela.inserir(
    { id: "c2", concurso_id: CONCURSO_UGP, nome: "António UGP", bi: "002LA02", email: "antonio@ugp.ao" },
    CONCURSO_UGP
  );

  // Sessão Bengo só vê o Manuel
  const vistosPeloBengo = tabela.consultar(CONCURSO_BENGO);
  assert.equal(vistosPeloBengo.length, 1);
  assert.equal(vistosPeloBengo[0].nome, "Manuel Bengo");

  // Sessão UGP só vê o António
  const vistosPelaUgp = tabela.consultar(CONCURSO_UGP);
  assert.equal(vistosPelaUgp.length, 1);
  assert.equal(vistosPelaUgp[0].nome, "António UGP");
});

test("RLS WITH CHECK: bloqueia tentativa de escrita em concurso alheio", () => {
  const tabela = new TabelaSimuladaComRLS<CandidatoSimulado>();
  const CONCURSO_BENGO = "concurso-uuid-bengo";
  const CONCURSO_UGP = "concurso-uuid-ugp";

  // Estando no Bengo, tentar forçar a criação no UGP tem de rebentar
  assert.throws(
    () => {
      tabela.inserir(
        { id: "c-intruso", concurso_id: CONCURSO_UGP, nome: "Intruso", bi: "999LA99", email: "intruso@teste.ao" },
        CONCURSO_BENGO
      );
    },
    { message: /RLS WITH CHECK VIOLATION/ }
  );
});

test("Unicidade por concurso: o mesmo BI pode candidatar-se ao Bengo e à UGP", () => {
  const candidatos: CandidatoSimulado[] = [];
  const CONCURSO_BENGO = "concurso-uuid-bengo";
  const CONCURSO_UGP = "concurso-uuid-ugp";
  const MESMO_BI = "005432123LA045";

  function registarCandidatura(c: CandidatoSimulado) {
    // Unicidade composta: UNIQUE (concurso_id, bi)
    const existe = candidatos.some((item) => item.concurso_id === c.concurso_id && item.bi === c.bi);
    if (existe) throw new Error("Candidato já registado neste concurso");
    candidatos.push(c);
  }

  // Candidatura ao Bengo
  assert.doesNotThrow(() => {
    registarCandidatura({
      id: "cand-1",
      concurso_id: CONCURSO_BENGO,
      nome: "Gaspar Domingos",
      bi: MESMO_BI,
      email: "gaspar@email.com",
    });
  });

  // O mesmo candidato concorre à UGP: DEVE conseguir concorrer
  assert.doesNotThrow(() => {
    registarCandidatura({
      id: "cand-2",
      concurso_id: CONCURSO_UGP,
      nome: "Gaspar Domingos",
      bi: MESMO_BI,
      email: "gaspar@email.com",
    });
  });

  // Tentar concorrer uma SEGUNDA VEZ ao Bengo com o mesmo BI: DEVE ser recusado
  assert.throws(() => {
    registarCandidatura({
      id: "cand-3",
      concurso_id: CONCURSO_BENGO,
      nome: "Gaspar Domingos",
      bi: MESMO_BI,
      email: "gaspar.novo@email.com",
    });
  }, { message: /já registado neste concurso/ });
});

test("Unicidade de sala por concurso: concursos diferentes podem usar a Sala 1 à mesma hora", () => {
  const entrevistas: EntrevistaSimulada[] = [];
  const CONCURSO_BENGO = "concurso-uuid-bengo";
  const CONCURSO_UGP = "concurso-uuid-ugp";
  const HORA = "2026-10-15T09:00:00+01:00";

  function marcarEntrevista(e: EntrevistaSimulada) {
    // UNIQUE (concurso_id, inicio, sala)
    const choque = entrevistas.some(
      (item) => item.concurso_id === e.concurso_id && item.sala === e.sala && item.inicio === e.inicio
    );
    if (choque) throw new Error("Sala ocupada neste concurso");
    entrevistas.push(e);
  }

  // Bengo marca Sala 1 às 09:00
  assert.doesNotThrow(() => {
    marcarEntrevista({ id: "e1", concurso_id: CONCURSO_BENGO, sala: 1, inicio: HORA });
  });

  // UGP marca Sala 1 à mesma hora: DEVE ser permitido porque são concursos distintos
  assert.doesNotThrow(() => {
    marcarEntrevista({ id: "e2", concurso_id: CONCURSO_UGP, sala: 1, inicio: HORA });
  });

  // Bengo tenta marcar uma segunda pessoa na Sala 1 à mesma hora: DEVE falhar
  assert.throws(() => {
    marcarEntrevista({ id: "e3", concurso_id: CONCURSO_BENGO, sala: 1, inicio: HORA });
  }, { message: /Sala ocupada neste concurso/ });
});
