import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import PoderesPanel from '../poderes/PoderesPanel';
import ElementosPanel from '../arsenal/ElementosPanel';
import { FichaFormProvider } from '../ficha/FichaFormContext';
import { FichaCondicoesEElementais } from '../ficha/FichaSubComponents';
import { useFichaAtiva, useCallSaveAtivo, useSalvarImediatoAtivo } from './FichaAlvoContext';
import { TEMAS_PADRAO } from '../../core/temas';
import { normalizarCorDestaque, varsCssDestaque } from '../../core/grimorioEstetica';

// 📖 O Grimório herda o estilo do app (Perfil > Aparência: classe `theme-*` no <body>): painéis, botões (.btn-neon),
// caixas (.def-box) e campos usam os mesmos tokens do tema. A única personalização é a cor de destaque, que troca
// --cor-primaria & cia SÓ dentro do Grimório (core/grimorioEstetica.js). Visual em css/styles.css (.grimorio-*).

const PAGINAS = [
    { id: 1, rotulo: '🗡️ Poderes', titulo: 'O Livro dos Poderes' },
    { id: 2, rotulo: '🌊 Elementos', titulo: 'Afinidades & Elementos' },
    { id: 3, rotulo: '🩹 Estados', titulo: 'Estados, Afinidades & Reduções' }
];

const COR_PADRAO_SELETOR = '#00ffff';

// Cores prontas: a cor principal de cada tema pré-definido do app (core/temas.js).
const CORES_PRONTAS = Object.values(TEMAS_PADRAO)
    .map(t => ({ id: t.id, nome: t.nome, emoji: t.emoji, cor: normalizarCorDestaque(t.vars && t.vars['--cor-primaria']) }))
    .filter(t => t.cor);

// Cor principal do tema do app que está valendo agora (para o seletor começar nela quando não há cor personalizada).
function corDoTemaAtual() {
    try {
        const bruto = getComputedStyle(document.body).getPropertyValue('--cor-primaria');
        return normalizarCorDestaque(bruto) || COR_PADRAO_SELETOR;
    } catch (e) { return COR_PADRAO_SELETOR; }
}

export default function GrimorioPanel() {
    // 🔥 GRIMÓRIO DA ENTIDADE: dentro de um FichaAlvoProvider (livro do Mestre) é o Grimório de
    // OUTRO personagem — Poderes e Elementos abaixo também passam a mirar ele. Fora disso, o meu.
    const { ficha: minhaFicha, updateFicha, nome: meuNome, souEuMesmo } = useFichaAtiva();
    const salvarFichaSilencioso = useCallSaveAtivo();
    const salvarFirebaseImediato = useSalvarImediatoAtivo();
    const idPainelCores = useId();
    const idBase = useId();

    const [paginaAtual, setPaginaAtual] = useState(1);
    const [painelCores, setPainelCores] = useState(false);
    const [salvando, setSalvando] = useState(false);
    // Cor escolhida e ainda não gravada (null = vale a que está na ficha). A gravação é adiada para não salvar a cada
    // pixel do seletor; ao sair da tela o que estava pendente é gravado.
    const [corLocal, setCorLocal] = useState(null);
    const timerCor = useRef(null);
    const pendenteRef = useRef(null);

    const corSalva = normalizarCorDestaque(minhaFicha?.esteticaGrimorio?.corDestaque);
    const cor = corLocal !== null ? corLocal : corSalva;

    // A gravação usa o `updateFicha`/`salvar` do MOMENTO da escolha: se o Mestre trocar de entidade antes dos 400ms,
    // a cor vai para a ficha de quem foi escolhida, nunca para a nova.
    const gravarCor = useCallback((valor) => {
        updateFicha((f) => { f.esteticaGrimorio = valor ? { corDestaque: valor } : {}; });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const mudarCor = useCallback((valor, imediato = false) => {
        const nova = normalizarCorDestaque(valor);
        setCorLocal(nova);
        clearTimeout(timerCor.current);
        const gravar = () => { timerCor.current = null; pendenteRef.current = null; gravarCor(nova); setCorLocal(null); };
        if (imediato) { pendenteRef.current = null; gravar(); } else { pendenteRef.current = { valor: nova, gravar: () => gravarCor(nova) }; timerCor.current = setTimeout(gravar, 400); }
    }, [gravarCor]);

    // Trocar de entidade (ou sair da tela): grava o pendente na entidade ANTIGA e zera a cor local.
    useEffect(() => {
        setCorLocal(null);
        return () => {
            clearTimeout(timerCor.current);
            timerCor.current = null;
            const pend = pendenteRef.current;
            pendenteRef.current = null;
            if (pend) pend.gravar();
        };
    }, [meuNome]);

    const varsCor = useMemo(() => varsCssDestaque(cor), [cor]);
    const corDoSeletor = cor || corDoTemaAtual();

    if (!minhaFicha) return <div className="grimorio grimorio-carregando">Invocando o Grimório...</div>;

    const pagina = PAGINAS.find(p => p.id === paginaAtual) || PAGINAS[0];

    const idAba = (id) => `${idBase}-aba-${id}`;
    const idPainelPagina = `${idBase}-pagina`;
    // Setas esquerda/direita (e Home/End) movem o foco e a seleção entre as abas (roving tabindex).
    const aoTeclarAba = (e) => {
        const idx = PAGINAS.findIndex(p => p.id === paginaAtual);
        let prox = -1;
        if (e.key === 'ArrowRight') prox = (idx + 1) % PAGINAS.length;
        else if (e.key === 'ArrowLeft') prox = (idx - 1 + PAGINAS.length) % PAGINAS.length;
        else if (e.key === 'Home') prox = 0;
        else if (e.key === 'End') prox = PAGINAS.length - 1;
        if (prox < 0) return;
        e.preventDefault();
        setPaginaAtual(PAGINAS[prox].id);
        const el = document.getElementById(idAba(PAGINAS[prox].id));
        if (el) el.focus();
    };

    const handleSalvarTudo = () => {
        setSalvando(true);
        if (typeof salvarFirebaseImediato === 'function') {
            salvarFirebaseImediato()
                .then(() => setTimeout(() => setSalvando(false), 1500))
                .catch(() => { alert("Erro ao sincronizar na nuvem!"); setSalvando(false); });
        } else {
            salvarFichaSilencioso();
            setTimeout(() => setSalvando(false), 1500);
        }
    };

    return (
        <div className="grimorio" style={varsCor}>
            <header className="grimorio-cabecalho">
                <div className="grimorio-cabecalho-texto">
                    <h2 className="grimorio-titulo">📖 {pagina.titulo}</h2>
                    {!souEuMesmo && <p className="grimorio-subtitulo">Grimório de {meuNome}</p>}
                </div>
                <div className="grimorio-cabecalho-acoes">
                    <button type="button" className={`btn-neon btn-green grimorio-btn${salvando ? ' salvando' : ''}`} onClick={handleSalvarTudo}>
                        {salvando ? '✅ Gravado!' : '💾 Gravar Magia'}
                    </button>
                    <button type="button" className="btn-neon grimorio-btn" aria-expanded={painelCores} aria-controls={idPainelCores} onClick={() => setPainelCores(v => !v)}>
                        🎨 Cores
                    </button>
                </div>
            </header>

            {painelCores && (
                <section id={idPainelCores} className="def-box grimorio-cores fade-in" aria-label="Cores do Grimório">
                    <p className="grimorio-cores-nota">
                        O Grimório segue o estilo do app (troque em Perfil &gt; Aparência). Aqui você pode dar a ele uma cor de destaque própria.
                    </p>
                    <div className="grimorio-cores-linha">
                        <label className="grimorio-cores-seletor">
                            <span>Cor de destaque</span>
                            <input type="color" value={corDoSeletor} onChange={(e) => mudarCor(e.target.value)} aria-label="Cor de destaque do Grimório" />
                        </label>
                        <div className="grimorio-cores-prontas" role="group" aria-label="Cores prontas">
                            {CORES_PRONTAS.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`grimorio-cor-amostra${cor === c.cor ? ' ativa' : ''}`}
                                    style={{ '--cor-amostra': c.cor }}
                                    aria-pressed={cor === c.cor}
                                    title={c.nome}
                                    aria-label={`Cor ${c.nome}`}
                                    onClick={() => mudarCor(c.cor, true)}
                                />
                            ))}
                        </div>
                        <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm" disabled={!cor} onClick={() => mudarCor('', true)}>
                            Seguir o tema do app
                        </button>
                    </div>
                </section>
            )}

            <nav className="grimorio-abas" role="tablist" aria-label="Páginas do Grimório" onKeyDown={aoTeclarAba}>
                {PAGINAS.map(p => (
                    <button
                        key={p.id}
                        id={idAba(p.id)}
                        type="button"
                        role="tab"
                        aria-selected={paginaAtual === p.id}
                        aria-controls={idPainelPagina}
                        tabIndex={paginaAtual === p.id ? 0 : -1}
                        className={`grimorio-aba${paginaAtual === p.id ? ' ativa' : ''}`}
                        onClick={() => setPaginaAtual(p.id)}
                    >
                        {p.rotulo}
                    </button>
                ))}
            </nav>

            <div className="grimorio-pagina" id={idPainelPagina} role="tabpanel" aria-labelledby={idAba(pagina.id)}>
                {paginaAtual === 1 && <PoderesPanel />}

                {/* O componente de Elementos já tem a sua própria navegação de "Capítulos". */}
                {paginaAtual === 2 && <ElementosPanel />}

                {/* Debuffs, Afinidades e Reduções de Dano (antes na aba Ficha). O editor grava na ficha do jogador logado. */}
                {paginaAtual === 3 && (souEuMesmo ? (
                    <FichaFormProvider>
                        <FichaCondicoesEElementais />
                    </FichaFormProvider>
                ) : (
                    <p className="grimorio-pagina-aviso">Os Estados, Afinidades e Reduções de Dano de {meuNome} só podem ser editados pelo próprio jogador, na página 3 do Grimório dele.</p>
                ))}
            </div>
        </div>
    );
}
