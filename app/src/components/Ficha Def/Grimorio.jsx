import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import PoderesPanel from '../poderes/PoderesPanel';
import ElementosPanel from '../arsenal/ElementosPanel';
import { FichaFormProvider } from '../ficha/FichaFormContext';
import { FichaCondicoesEElementais } from '../ficha/FichaSubComponents';
import { useFichaAtiva, useCallSaveAtivo, useSalvarImediatoAtivo } from './FichaAlvoContext';
import { TEMAS_PADRAO } from '../../core/temas';
import { normalizarCorDestaque, migrarEsteticaGrimorio, montarEsteticaGrimorio, varsCssGrimorio, contrasteBaixo, cssParaHex } from '../../core/grimorioEstetica';

// 📖 O Grimório herda o estilo do app (Perfil > Aparência: classe `theme-*` no <body>): painéis, botões (.btn-neon),
// caixas (.def-box) e campos usam os mesmos tokens do tema. As personalizações são cor de destaque, de texto e de
// fundo, que trocam variáveis CSS (--cor-primaria & cia, --grimorio-texto, --grimorio-fundo) SÓ dentro do Grimório (core/grimorioEstetica.js). Visual em css/styles.css (.grimorio-*).

const PAGINAS = [
    { id: 1, rotulo: '🗡️ Poderes', titulo: 'O Livro dos Poderes' },
    { id: 2, rotulo: '🌊 Elementos', titulo: 'Afinidades & Elementos' },
    { id: 3, rotulo: '🩹 Estados', titulo: 'Estados, Afinidades & Reduções' }
];

const COR_PADRAO_SELETOR = '#00ffff';

const unicas = (lista) => lista.filter((c, i) => c.cor && lista.findIndex(o => o.cor === c.cor) === i);
const temasComVar = (variavel) => Object.values(TEMAS_PADRAO)
    .map(t => ({ id: t.id, nome: t.nome, cor: normalizarCorDestaque(t.vars && t.vars[variavel]) }));

// Amostras prontas (são dados, por isso a cor vai inline). Destaque e fundo vêm dos temas do app (core/temas.js).
const AMOSTRAS = {
    corDestaque: unicas(temasComVar('--cor-primaria')),
    corTexto: [
        { id: 'branco', nome: 'Branco', cor: '#ffffff' }, { id: 'cinza-claro', nome: 'Cinza claro', cor: '#d0d0d8' },
        { id: 'cinza', nome: 'Cinza', cor: '#8a8a99' }, { id: 'preto', nome: 'Preto', cor: '#000000' },
        { id: 'creme', nome: 'Creme', cor: '#f4e4bc' }, { id: 'ciano-claro', nome: 'Ciano claro', cor: '#aaffff' },
        { id: 'verde-claro', nome: 'Verde claro', cor: '#b6ffc8' }, { id: 'rosa-claro', nome: 'Rosa claro', cor: '#ffc2e6' }
    ],
    corFundo: unicas([
        ...temasComVar('--bg-body-2'),
        { id: 'preto', nome: 'Preto', cor: '#000000' }, { id: 'grafite', nome: 'Grafite', cor: '#1c1c24' },
        { id: 'cinza-claro', nome: 'Cinza claro', cor: '#e6e6ec' }, { id: 'branco', nome: 'Branco', cor: '#ffffff' },
        { id: 'pergaminho', nome: 'Pergaminho', cor: '#f4e4bc' }
    ])
};

const CAMPOS = [
    { chave: 'corDestaque', rotulo: 'Destaque' },
    { chave: 'corTexto', rotulo: 'Texto' },
    { chave: 'corFundo', rotulo: 'Fundo' }
];

// Cor que o tema do app está dando agora (para o seletor começar nela quando não há cor personalizada).
// Devolve '' quando o navegador não dá uma cor que a gente entenda (ex.: color-mix); aí só o seletor usa um padrão.
function corDoTemaAtual(chave) {
    try {
        const cs = getComputedStyle(document.body);
        if (chave === 'corTexto') return cssParaHex(cs.color);
        const bruto = cs.getPropertyValue(chave === 'corFundo' ? '--bg-body-2' : '--cor-primaria');
        return normalizarCorDestaque(bruto) || cssParaHex(bruto);
    } catch (e) { return ''; }
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
    // Cores escolhidas e ainda não gravadas (null = vale o que está na ficha). A gravação é adiada para não salvar a
    // cada pixel do seletor; ao sair da tela o que estava pendente é gravado.
    const [estLocal, setEstLocal] = useState(null);
    const timerCor = useRef(null);
    const pendenteRef = useRef(null);

    const estSalva = useMemo(() => migrarEsteticaGrimorio(minhaFicha?.esteticaGrimorio), [minhaFicha?.esteticaGrimorio]);
    const est = estLocal !== null ? estLocal : estSalva;

    // A gravação usa o `updateFicha`/`salvar` do MOMENTO da escolha: se o Mestre trocar de entidade antes dos 400ms,
    // as cores vão para a ficha de quem foi escolhida, nunca para a nova.
    const gravarEst = useCallback((valor) => {
        updateFicha((f) => { f.esteticaGrimorio = valor; });
        salvarFichaSilencioso();
    }, [updateFicha, salvarFichaSilencioso]);

    const aplicarEst = useCallback((nova, imediato) => {
        setEstLocal(nova);
        clearTimeout(timerCor.current);
        const gravar = () => { timerCor.current = null; pendenteRef.current = null; gravarEst(nova); setEstLocal(null); };
        if (imediato) { pendenteRef.current = null; gravar(); } else { pendenteRef.current = { gravar: () => gravarEst(nova) }; timerCor.current = setTimeout(gravar, 400); }
    }, [gravarEst]);

    const mudarCor = useCallback((chave, valor, imediato = false) => {
        aplicarEst(montarEsteticaGrimorio({ ...est, [chave]: normalizarCorDestaque(valor) }), imediato);
    }, [est, aplicarEst]);

    // Trocar de entidade (ou sair da tela): grava o pendente na entidade ANTIGA e zera o estado local.
    useEffect(() => {
        setEstLocal(null);
        return () => {
            clearTimeout(timerCor.current);
            timerCor.current = null;
            const pend = pendenteRef.current;
            pendenteRef.current = null;
            if (pend) pend.gravar();
        };
    }, [meuNome]);

    const varsCor = useMemo(() => varsCssGrimorio(est), [est]);
    const temCores = Object.keys(est).length > 0;

    // Aviso de contraste (razão WCAG < 3) entre o texto e o fundo que estão valendo (personalizados ou do tema).
    // `temaAtivo` (classe do <body>) é lido enquanto o painel está aberto, para o aviso reagir à troca de tema.
    const [temaAtivo, setTemaAtivo] = useState('');
    useEffect(() => {
        if (!painelCores) return undefined;
        const ler = () => setTemaAtivo(document.body.className);
        ler();
        if (typeof MutationObserver === 'undefined') return undefined;
        const obs = new MutationObserver(ler);
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, [painelCores]);

    const avisoContraste = useMemo(() => {
        if (!painelCores || (!est.corTexto && !est.corFundo)) return false;
        return contrasteBaixo(est.corTexto || corDoTemaAtual('corTexto'), est.corFundo || corDoTemaAtual('corFundo'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [painelCores, est.corTexto, est.corFundo, temaAtivo]);

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
        <div className={`grimorio${est.corTexto ? ' grimorio--texto' : ''}${est.corFundo ? ' grimorio--fundo' : ''}`} style={varsCor}>
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
                        O Grimório segue o estilo do app (troque em Perfil &gt; Aparência). Aqui você pode dar a ele cores próprias.
                    </p>
                    {CAMPOS.map(({ chave, rotulo }) => {
                        const valor = est[chave] || '';
                        return (
                            <div key={chave} className="grimorio-cores-linha">
                                <label className="grimorio-cores-seletor">
                                    <span>{rotulo}</span>
                                    <input type="color" value={valor || corDoTemaAtual(chave) || (chave === 'corTexto' ? '#ffffff' : COR_PADRAO_SELETOR)} onChange={(e) => mudarCor(chave, e.target.value)} aria-label={`Cor de ${rotulo.toLowerCase()} do Grimório`} />
                                </label>
                                <div className="grimorio-cores-prontas" role="group" aria-label={`Cores prontas de ${rotulo.toLowerCase()}`}>
                                    {AMOSTRAS[chave].map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className={`grimorio-cor-amostra${valor === c.cor ? ' ativa' : ''}`}
                                            style={{ '--cor-amostra': c.cor }}
                                            aria-pressed={valor === c.cor}
                                            title={c.nome}
                                            aria-label={`${rotulo} ${c.nome}`}
                                            onClick={() => mudarCor(chave, c.cor, true)}
                                        />
                                    ))}
                                </div>
                                <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm" disabled={!valor} onClick={() => mudarCor(chave, '', true)}>
                                    Seguir o tema
                                </button>
                            </div>
                        );
                    })}
                    <div className="grimorio-cores-rodape">
                        <span className="grimorio-cores-aviso" aria-live="polite">{avisoContraste ? '⚠ contraste baixo entre texto e fundo' : ''}</span>
                        <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm" disabled={!temCores} onClick={() => aplicarEst({}, true)}>
                            Restaurar tudo
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
