import { CAMPOS, type Agregado, type Grafico } from "@/lib/dashboard/campos";
import { corDaFatia, numero, SEM_DADO, SERIE } from "@/components/dashboard/paleta";

/**
 * ===========================================================================
 * UM GRÁFICO
 * ---------------------------------------------------------------------------
 * Desenhado no servidor, em SVG e HTML simples. Sem biblioteca de gráficos e
 * sem uma linha de JavaScript no cliente. São três razões, todas pedidas:
 *
 *  LEVE     uma biblioteca de gráficos são 150 a 400 KB que o telemóvel de
 *           alguém em Luanda teria de descarregar antes de ver o primeiro
 *           número. Assim a página chega desenhada.
 *  RÁPIDO   os dados já estão no servidor quando a página se monta. Mandá-los
 *           para o cliente para ele os desenhar é fazer a mesma viagem duas
 *           vezes.
 *  ACESSÍVEL cada marca leva um <title>, que o browser mostra ao passar o rato
 *           e o leitor de ecrã lê. E por baixo de cada gráfico há a tabela com
 *           os mesmos números, para quem não distingue as cores ou prefere ler.
 * ===========================================================================
 */

function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
      {mensagem}
    </p>
  );
}

/** A tabela com os mesmos números. Fechada, para não roubar o espaço. */
function Tabela({ a, campo }: { a: Agregado; campo: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-slate-900">
        Ver os números em tabela
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">{campo}</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Valor</th>
              <th scope="col" className="py-1 text-right font-medium">Candidaturas</th>
            </tr>
          </thead>
          <tbody>
            {a.baldes.map((b) => (
              <tr key={b.rotulo} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-3">{b.rotulo}</td>
                <td className="py-1 pr-3 text-right font-medium tabular-nums">
                  {numero(b.valor)}
                  {a.unidade}
                </td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">{b.quantas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ═════════════════════════════ BARRAS DEITADAS ═════════════════════════ */
/* HTML puro: o rótulo pode quebrar em duas linhas no telemóvel, coisa que num
   SVG obrigaria a medir texto à mão. */

function BarrasDeitadas({ a }: { a: Agregado }) {
  return (
    <ul className="space-y-2">
      {a.baldes.map((b) => {
        const largura = a.maximo > 0 ? Math.max(1.5, (b.valor / a.maximo) * 100) : 0;
        return (
          <li key={b.rotulo} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,11rem)_1fr_auto] sm:gap-3">
            <span className="truncate text-xs text-slate-700 sm:text-sm" title={b.rotulo}>
              {b.rotulo}
            </span>
            <span className="h-4 rounded-full bg-slate-100" role="presentation">
              <span
                className="block h-4 rounded-full"
                style={{
                  width: `${largura}%`,
                  backgroundColor: b.rotulo === "Não indicado" || b.rotulo.startsWith("Outros") ? SEM_DADO : SERIE,
                }}
                title={`${b.rotulo}: ${numero(b.valor)}${a.unidade} (${b.quantas} candidatura(s))`}
              />
            </span>
            <span className="w-14 text-right text-xs font-semibold tabular-nums text-slate-900 sm:text-sm">
              {numero(b.valor)}
              {a.unidade}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ═══════════════════════════════ BARRAS ════════════════════════════════ */

function Barras({ a }: { a: Agregado }) {
  const n = a.baldes.length;
  const L = 320;
  const A = 150;
  const base = A - 26;
  // 2px de folga entre barras: sem ela duas barras encostadas lêem-se como uma.
  // E um tecto na largura: com duas ou três categorias, barras a ocupar meio
  // gráfico cada parecem blocos de cor e não marcas de dados.
  const passo = L / n;
  const largura = Math.min(54, Math.max(6, passo - 8));

  return (
    <div className="overflow-hidden">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Gráfico de barras com ${n} colunas`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grelha recessiva: três linhas, e nada mais. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={L}
            y1={base - f * (base - 14)}
            y2={base - f * (base - 14)}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

        {a.baldes.map((b, i) => {
          const h = a.maximo > 0 ? Math.max(2, (b.valor / a.maximo) * (base - 18)) : 0;
          const x = i * passo + (passo - largura) / 2;
          const cinza = b.rotulo === "Não indicado" || b.rotulo.startsWith("Outros");
          return (
            <g key={b.rotulo}>
              <rect
                x={x}
                y={base - h}
                width={largura}
                height={h}
                rx={4}
                fill={cinza ? SEM_DADO : SERIE}
              >
                <title>{`${b.rotulo}: ${numero(b.valor)}${a.unidade} (${b.quantas} candidatura(s))`}</title>
              </rect>
              {/* Rótulo directo em cima da barra, em tinta de texto e não na
                  cor da série - o número não é parte do desenho. */}
              <text
                x={x + largura / 2}
                y={base - h - 5}
                textAnchor="middle"
                className="fill-slate-900"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {numero(b.valor)}
                {a.unidade}
              </text>
              <text
                x={x + largura / 2}
                y={A - 8}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 9 }}
              >
                {b.rotulo.length > 11 ? `${b.rotulo.slice(0, 10)}…` : b.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ════════════════════════════════ ANEL ═════════════════════════════════ */

function Anel({ a }: { a: Agregado }) {
  const total = a.baldes.reduce((s, b) => s + b.valor, 0);
  if (total <= 0) return <Vazio mensagem="Ainda não há nada para repartir." />;

  const R = 52;
  const grossura = 20;
  const perimetro = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
      <svg viewBox="0 0 130 130" className="h-32 w-32 shrink-0" role="img" aria-label="Gráfico em anel">
        <g transform="translate(65,65) rotate(-90)">
          {a.baldes.map((b, i) => {
            const fatia = (b.valor / total) * perimetro;
            // 2px de folga entre fatias, pela mesma razão das barras.
            const traco = Math.max(0, fatia - 2);
            const deslocamento = -acumulado;
            acumulado += fatia;
            return (
              <circle
                key={b.rotulo}
                r={R}
                fill="none"
                stroke={corDaFatia(b.rotulo, i)}
                strokeWidth={grossura}
                strokeDasharray={`${traco} ${perimetro - traco}`}
                strokeDashoffset={deslocamento}
                strokeLinecap="butt"
              >
                <title>{`${b.rotulo}: ${numero(b.valor)}${a.unidade}`}</title>
              </circle>
            );
          })}
        </g>
        <text x="65" y="62" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 20, fontWeight: 700 }}>
          {a.total}
        </text>
        <text x="65" y="76" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
          candidaturas
        </text>
      </svg>

      {/* Legenda sempre presente: a cor nunca é a única pista. */}
      <ul className="min-w-0 space-y-1.5 text-sm">
        {a.baldes.map((b, i) => (
          <li key={b.rotulo} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: corDaFatia(b.rotulo, i) }}
              aria-hidden
            />
            <span className="truncate text-slate-700">{b.rotulo}</span>
            <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-slate-900">
              {numero(b.valor)}
              {a.unidade}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════ LINHA ═════════════════════════════════ */

function Linha({ a }: { a: Agregado }) {
  const n = a.baldes.length;
  if (n < 2) return <Barras a={a} />;

  const L = 320;
  const A = 150;
  const base = A - 26;
  const passo = n > 1 ? L / (n - 1) : L;
  const ponto = (i: number, v: number) => ({
    x: i * passo,
    y: base - (a.maximo > 0 ? (v / a.maximo) * (base - 18) : 0),
  });

  const caminho = a.baldes
    .map((b, i) => {
      const p = ponto(i, b.valor);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Gráfico de linha">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={0} x2={L} y1={base - f * (base - 14)} y2={base - f * (base - 14)} stroke="#e2e8f0" strokeWidth={1} />
        ))}

        <path d={caminho} fill="none" stroke={SERIE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {a.baldes.map((b, i) => {
          const p = ponto(i, b.valor);
          return (
            <g key={b.rotulo}>
              {/* Anel da cor do fundo à volta do ponto, para ele não se perder
                  quando a linha passa por trás. */}
              <circle cx={p.x} cy={p.y} r={4.5} fill={SERIE} stroke="#ffffff" strokeWidth={2}>
                <title>{`${b.rotulo}: ${numero(b.valor)}${a.unidade}`}</title>
              </circle>
              <text x={p.x} y={A - 8} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>
                {b.rotulo}
              </text>
            </g>
          );
        })}

        {/* Rótulo só no primeiro e no último ponto: um número em cada ponto
            transforma o gráfico numa tabela mal desenhada. */}
        {[0, n - 1].map((i) => {
          const b = a.baldes[i];
          const p = ponto(i, b.valor);
          return (
            <text
              key={`r${i}`}
              x={Math.min(L - 14, Math.max(14, p.x))}
              y={p.y - 9}
              textAnchor="middle"
              className="fill-slate-900"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {numero(b.valor)}
              {a.unidade}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════ CARTÃO ════════════════════════════════ */

export function CartaoGrafico({
  grafico,
  agregado,
  accoes,
}: {
  grafico: Grafico;
  agregado: Agregado;
  accoes?: React.ReactNode;
}) {
  const campo = CAMPOS.find((c) => c.chave === grafico.campo);

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{grafico.titulo}</h3>
          <p className="text-xs text-muted-foreground">
            {campo?.rotulo ?? grafico.campo}
            {campo?.nota ? ` · ${campo.nota}` : ""}
            {agregado.semDado > 0 ? ` · ${agregado.semDado} sem o número` : ""}
          </p>
        </div>
        {accoes}
      </div>

      {agregado.baldes.length === 0 ? (
        <Vazio mensagem="Ainda não há candidaturas que cheguem para este gráfico." />
      ) : (
        <>
          {grafico.feitio === "barrasH" && <BarrasDeitadas a={agregado} />}
          {grafico.feitio === "barras" && <Barras a={agregado} />}
          {grafico.feitio === "anel" && <Anel a={agregado} />}
          {grafico.feitio === "linha" && <Linha a={agregado} />}
          <Tabela a={agregado} campo={campo?.rotulo ?? "Valor"} />
        </>
      )}
    </section>
  );
}
