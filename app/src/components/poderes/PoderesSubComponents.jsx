import { TIPOS_ACAO_TECNICA } from '../../core/acoesTecnica';
import DescricoesAtaqueEditor from '../shared/DescricoesAtaqueEditor';
import EstadosGolpeEditor from '../shared/EstadosGolpeEditor';
import AoAcertarEditor from '../shared/AoAcertarEditor';
import SuporteEditor from '../shared/SuporteEditor';
import React, { useState, useId, useMemo, useRef, useEffect } from 'react';
import { usePoderesForm, SINGULAR } from './PoderesFormContext';
import { SECOES_FORM, resumirSecoes, rascunhoTemConteudo } from '../../core/rascunhoPoder';
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS, GRUPO_REACOES, GRUPO_IDENTIFICACAO, getPropriedadesDoAtributo, ajustarPropriedade } from '../../core/efeitos-constants';
import FormasEditor from '../shared/FormasEditor';
import EstagioControle from './EstagioControle';
import EstagiosMarcosEditor from './EstagiosMarcosEditor';
import { escalarEfeitosPorEstagio, previaEstagios, getMaximoEstagio, normalizarEstagios } from '../../core/estagios';
import { construirArvorePastas, segmentosPasta, chavePastaAberta, NOME_SEM_PASTA } from '../../core/pastas';
import { rotuloComPolaridade } from '../../core/polaridade';
import { montarPromptImportacao, prepararImportacao } from '../../core/importadorIA';
import ImportadorPrevia from './ImportadorPrevia';
import ModelosPoderAssistente from './ModelosPoderAssistente';
import { descreverOrigem } from '../../core/modelosPoder';
import LerTextoComIA, { AvisoPartesFalhas } from './LerTextoComIA';
import useStore from '../../stores/useStore';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';
import { dividirEmPartes, textoProgresso, chaveImportadorIA, MENSAGEM_SEM_CHAVE } from '../../core/transcricaoIA';
import { transcreverEmPartes } from '../../services/transcricaoIA';
import LerDeImagemIA from '../shared/LerDeImagemIA';
import { TEXTO_DAS_IMAGENS } from '../../core/imagemIA';
import CondicaoDoEfeito from '../shared/CondicaoDoEfeito';
import { descreverUsos } from '../../core/usosPoder';
import { TIPOS_ESCUDO } from '../../core/escudos';
import { ENERGIAS_CUSTO, descreverCustoPorTurno } from '../../core/custoPorTurno';
import { descreverRecarga } from '../../core/recargaPoder';
import EnsinarBotao from '../shared/EnsinarBotao';
import GatilhosEditor from './GatilhosEditor';
import { descreverGatilho } from '../../core/gatilhos';
import EnsinamentosRecebidos from '../shared/EnsinamentosRecebidos';

const LIMITE_PREVIA_ESTAGIOS = 12;
const fmtNumero = (v) => (typeof v === 'number' ? (Math.round(v * 10000) / 10000).toLocaleString('pt-BR') : v);
// Texto da condição e do escopo de um efeito na lista (vazio se não tiver nenhum).
const textoCondicaoEfeito = (e) => [e.quando ? ` · quando: ${e.quando.replace(':', ' ')}` : '', e.escopo ? ` · vale em: ${e.escopo.replace(':', ' ')}` : ''].join('');
const textoEfeito = (e) => `${(e.atributo || '').replace('_', ' ').toUpperCase()} ${(e.propriedade || '').toUpperCase()} ${fmtNumero(e.valor)}${e.fixo ? ' (fixo)' : ''}`;

// 🔎 Tabela "estágio a estágio" no editor, com a config ainda em rascunho (core/estagios.js >
// previaEstagios) — mostra exatamente o que cada estágio dá antes de gravar.
function PreviaEstagios({ efeitosBase, estagiosEditor }) {
    const linhas = previaEstagios(efeitosBase, estagiosEditor, LIMITE_PREVIA_ESTAGIOS);
    const max = getMaximoEstagio({ estagios: normalizarEstagios(estagiosEditor) });
    return (
        <div className="estagios-previa">
            <div className="estagios-marcos-titulo">🔎 Prévia estágio a estágio</div>
            {linhas.map(l => (
                <div key={l.estagio} className={`estagios-previa-linha${l.marco ? ' marco' : ''}`}>
                    <span className="estagios-previa-nome">{l.marco ? '✦ ' : ''}{l.nome}</span>
                    <span className="estagios-previa-efeitos">{l.efeitos.length ? l.efeitos.map(textoEfeito).join(' · ') : 'sem efeitos ativos'}</span>
                    <span className="estagios-previa-fadiga">😮‍💨 {fmtNumero(l.fadiga)}%/turno</span>
                </div>
            ))}
            {max > LIMITE_PREVIA_ESTAGIOS && (
                <div className="estagios-previa-mais">… {max === Infinity ? 'e continua sem limite' : `até o ${max}º`}</div>
            )}
        </div>
    );
}

const FALLBACK = <div style={{ opacity: 0.5, padding: 10 }}>Poderes provider não encontrado</div>;

// 🔥 Só nesta aba (Habilidades/Formas/Poderes do Grimório): "PODER (Direto)" multiplica o Poder do
// Scouter diretamente, sem passar por nenhum Status/Energia/Vida — não existe em ArsenalPanel/
// FormasEditor porque só o Grimório (ficha.poderes) é lido por getPoderDiretoMultiplier (Marcados.jsx).
//
// ⚖️ O alvo DANO fica de fora daqui: os Multiplicadores de Dano não multiplicam mais o dano (só o
// Poder Calculado), e o Grimório só mexe no Poder pelo PODER (Direto) — um efeito de DANO aqui
// não teria efeito nenhum. Efeitos antigos com DANO continuam salvos, só não aparecem pra escolha.
const ATRIBUTOS_PODERES = [
    ...ATRIBUTOS_AGRUPADOS.map(g => ({ ...g, options: g.options.filter(o => o !== 'dano') })).filter(g => g.options.length > 0),
    { label: '⚡ POTÊNCIA DO SCOUTER', options: ['poder_direto'] },
    GRUPO_REACOES,
    GRUPO_IDENTIFICACAO
];

// Exportada pra reuso no seletor "Elemento do Dano" do Dano Rápido do Mestre (ver
// MapaFerramentasMestre.jsx > MapaMestreDanoRapido) — mesma grafia usada nas Técnicas Elementais
// aqui, essencial pra bater com o nome do Domínio treinado na Hierarquia (página 3 da Ficha).
export const ELEMENTOS_OPCOES = [
    { label: 'Elementos Básicos', opcoes: ['Fogo', 'Agua', 'Raio', 'Terra', 'Vento'] },
    { label: 'Básicos Verdadeiros', opcoes: ['Fogo Verdadeiro', 'Agua Verdadeira', 'Raio Verdadeiro', 'Terra Verdadeira', 'Vento Verdadeiro'] },
    { label: 'Elementos Avançados', opcoes: ['Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza'] },
    { label: 'Avançados Verdadeiros', opcoes: ['Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira'] },
    { label: 'Elementos Primordiais', opcoes: ['Luz', 'Trevas', 'Ether', 'Celestial', 'Infernal', 'Caos', 'Criacao', 'Destruicao', 'Cosmos'] },
    { label: 'Elementos Astrais', opcoes: ['Vida', 'Morte', 'Vazio'] },
    { label: 'Kekkei Genkai / Touta', opcoes: ['Elemento Madeira', 'Elemento Mineral', 'Elemento Cinzas', 'Elemento Igneo', 'Elemento Lava', 'Elemento Vapor', 'Elemento Nevoa', 'Elemento Tempestade', 'Elemento Areia', 'Elemento Tufao', 'Elemento Velocidade', 'Elemento Poeira', 'Elemento Calor', 'Elemento Cal', 'Elemento Carbono', 'Elemento Veneno', 'Elemento Magnetismo', 'Elemento Som'] },
    { label: 'Magias Ancestrais', opcoes: ['Truques Ancestrais', 'Magia de Sangue', 'Magia de Osso', 'Magia Draconica', 'Magia de Borracha', 'Magia de Espelho', 'Magia de Sal', 'Magia de Alma', 'Magia de Tremor', 'Magia de Gravidade', 'Magia de Tempo', 'Magia de Equipamento', 'Magia de Explosao', 'Magia Espacial', 'Magia de Metamorfose'] },
    { label: 'Magias Arcanas/Negras', opcoes: ['Truques Arcanos/Negros', 'Magias Arcanas/Negra de 1º Ciclo', 'Magias Arcanas/Negra de 2º Ciclo', 'Magias Arcanas/Negra de 3º Ciclo', 'Magias Arcanas/Negra de 4º Ciclo', 'Magias Arcanas/Negra de 5º Ciclo', 'Magias Arcanas/Negra de 6º Ciclo', 'Magias Arcanas/Negra de 7º Ciclo', 'Magias Arcanas/Negra de 8º Ciclo', 'Magias Arcanas/Negra de 9º Ciclo', 'Magias Arcanas/Negra de 10º Ciclo'] },
    { label: 'Magias de Ciclo', opcoes: ['Truques de Ciclo', 'Magias de 1º Ciclo', 'Magias de 2º Ciclo', 'Magias de 3º Ciclo', 'Magias de 4º Ciclo', 'Magias de 5º Ciclo', 'Magias de 6º Ciclo', 'Magias de 7º Ciclo', 'Magias de 8º Ciclo', 'Magias de 9º Ciclo', 'Magias de 10º Ciclo'] },
    { label: 'Manifestações e Fusões', opcoes: ['Aura Pura', 'Projeção de Aura', 'Artes Marciais', 'Reforço Físico', 'Fusões Básicas', 'Fusões Avançadas'] }
];

// Lê o que ficou guardado do importador (store só em memória) sem assinar o estado: em testes com useStore
// simulado (sem getState) vira no-op. Cópia por JSON: o que mora na store fica congelado (Immer).
const lerSalvoImportador = (chave) => {
    try {
        const salvo = typeof useStore.getState === 'function' ? useStore.getState()?.importadoresIA?.[chave] : null;
        return salvo ? JSON.parse(JSON.stringify(salvo)) : null;
    } catch (e) { return null; }
};
const guardarImportador = (chave, valor) => {
    try {
        const st = typeof useStore.getState === 'function' ? useStore.getState() : null;
        if (!st) return;
        const vazio = !String(valor.texto || '').trim() && valor.previa.length === 0 && valor.falhas.length === 0;
        if (vazio) { if (st.limparImportadorIA) st.limparImportadorIA(chave); return; }
        if (st.setImportadorIA) st.setImportadorIA(chave, JSON.parse(JSON.stringify(valor)));
    } catch (e) { /* sem store: só em memória do componente */ }
};

export function PoderesImportadorIA() {
    const ctx = usePoderesForm();
    const configIA = useStore(s => s.sextaFeiraConfig);
    const chaveSalva = chaveImportadorIA(ctx && ctx.meuNome);
    const [salvo] = useState(() => lerSalvoImportador(chaveSalva));
    const [aberto, setAberto] = useState(() => !!(salvo && ((salvo.texto || '').trim() || (salvo.previa || []).length)));
    const [textoDocs, setTextoDocs] = useState(() => (salvo && salvo.texto) || '');
    const [jsonResposta, setJsonResposta] = useState('');
    const [fase, setFase] = useState(() => (salvo && (salvo.previa || []).length ? 3 : 1));
    const [promptGerado, setPromptGerado] = useState('');
    const [previa, setPrevia] = useState(() => (salvo && salvo.previa) || []);
    const [falhas, setFalhas] = useState(() => (salvo && salvo.falhas) || []);
    const [origem, setOrigem] = useState('ia');
    const [lendo, setLendo] = useState(false);
    const [progresso, setProgresso] = useState(null);
    const [erroIA, setErroIA] = useState('');
    const controleRef = useRef(null);
    const montadoRef = useRef(true);
    const previaRef = useRef(previa);
    previaRef.current = previa;
    const configurada = !!(configIA && configIA.chaveGemini);

    useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false; if (controleRef.current) controleRef.current.abort(); }; }, []);
    // Texto, prévia e partes que falharam sobrevivem a trocar de página/aba do livro (o Grimório desmonta ao sair).
    // Grava com debounce (300ms) e descarrega o que estiver pendente ao sair.
    const valorImportadorRef = useRef({ texto: textoDocs, previa, falhas });
    valorImportadorRef.current = { texto: textoDocs, previa, falhas };
    useEffect(() => {
        const timer = setTimeout(() => guardarImportador(chaveSalva, valorImportadorRef.current), 300);
        return () => clearTimeout(timer);
    }, [chaveSalva, textoDocs, previa, falhas]);
    useEffect(() => () => guardarImportador(chaveSalva, valorImportadorRef.current), [chaveSalva]);

    if (!ctx) return null;
    const { lerImportacao, confirmarImportacao, abaAtual } = ctx;
    const faseDeVolta = origem === 'ia' ? 1 : 2;

    // Lê a resposta da IA (colada) e abre a prévia (várias respostas podem ser somadas antes de gravar).
    const lerResposta = (texto) => {
        const fonte = typeof texto === 'string' ? texto : jsonResposta;
        const proxima = previa.reduce((m, it) => Math.max(m, it.chave), 0) + 1;
        const r = lerImportacao(fonte, proxima);
        if (!r.ok) { alert(r.erro); return false; }
        setOrigem('manual');
        setPrevia(atual => [...atual, ...r.itens]);
        setJsonResposta('');
        setFase(3);
        return true;
    };
    const gravarPrevia = () => {
        const total = confirmarImportacao(previa);
        if (total === 0) { alert('Nenhum item marcado para gravar.'); return; }
        alert(`Sincronização Concluída!\n\n🗡️ Inscritos: ${total}. Cada um foi para a aba da sua categoria.`);
        setPrevia([]);
        setFalhas([]);
        setErroIA('');
        setTextoDocs('');
        setPromptGerado('');
        setFase(1);
        setAberto(false);
    };

    const gerarPrompt = async () => {
        if (!textoDocs.trim()) return alert("Cole o texto primeiro!");
        const prompt = montarPromptImportacao(textoDocs, abaAtual);
        setPromptGerado(prompt);
        let copiou = false;
        try { await navigator.clipboard.writeText(prompt); copiou = true; } catch (e) { copiou = false; }
        alert(copiou ? "Instrução copiada! Cole na sua IA e traga o JSON gerado." : "Não consegui copiar sozinho: copie a instrução que apareceu na caixa e cole na sua IA.");
        setOrigem('manual');
        setFase(2);
    };

    // ✨ Uma etapa: manda as partes ao Gemini da mesa, em sequência, e abre a prévia com o que deu certo.
    const executarLeitura = async (partes, tentativaParcial) => {
        if (!configurada) { setErroIA(MENSAGEM_SEM_CHAVE); return; }
        if (!partes.length) { setErroIA('Cole o texto primeiro.'); return; }
        const aba = abaAtual; // a mesma aba vale para o prompt e para preparar os itens
        const controle = new AbortController();
        controleRef.current = controle;
        setErroIA('');
        setLendo(true);
        setProgresso({ indice: partes[0].indice, total: partes[0].total, texto: textoProgresso(partes[0].indice, partes[0].total) });
        try {
            const r = await transcreverEmPartes({
                chave: configIA.chaveGemini, modelo: configIA.modelo || MODELO_GEMINI_PADRAO, partes, aba, sinal: controle.signal,
                aoProgresso: (indice, total) => { if (montadoRef.current) setProgresso({ indice, total, texto: textoProgresso(indice, total) }); },
                jaExistentes: previaRef.current.map(it => it.objeto),
            });
            if (!montadoRef.current) return;
            const tentadas = new Set(partes.map(p => `${p.indice}_${p.total}`));
            setFalhas(atual => [...(tentativaParcial ? atual.filter(f => !tentadas.has(`${f.indice}_${f.total}`)) : []), ...r.falhas]);
            if (r.itens.length > 0) {
                const proxima = previaRef.current.reduce((m, it) => Math.max(m, it.chave), 0) + 1;
                const novos = prepararImportacao(r.itens, aba, proxima); // itens já validados: sem re-serializar
                setOrigem('ia');
                setPrevia(atual => [...atual, ...novos]);
                setFase(3);
            } else if (r.falhas.length === 0) setErroIA('A IA não encontrou habilidades nesse texto.');
        } catch (e) {
            if (montadoRef.current) setErroIA('Não consegui ler o texto com a IA. Tente de novo.');
        } finally {
            if (controleRef.current === controle) controleRef.current = null;
            if (montadoRef.current) { setLendo(false); setProgresso(null); }
        }
    };
    const lerComIA = () => {
        const partes = dividirEmPartes(textoDocs);
        executarLeitura(partes.map((texto, i) => ({ indice: i + 1, total: partes.length, texto })), false).catch(() => {});
    };
    const tentarDeNovo = (f) => { executarLeitura([{ indice: f.indice, total: f.total, texto: f.texto }], true).catch(() => {}); };
    const cancelarLeitura = () => { if (controleRef.current) controleRef.current.abort(); };

    return (
        <div className="grimorio-importar">
            <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm grimorio-importar-botao" onClick={() => setAberto(!aberto)}>
                {aberto ? 'Fechar Círculo de Invocação (IA)' : 'Abrir Círculo de Invocação (IA)'}
            </button>
            {aberto && (
                <div className="fade-in" style={{ marginTop: '10px', border: '1px dashed currentColor', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}>
                    {fase === 1 ? (
                        <>
                            <LerTextoComIA texto={textoDocs} onTexto={setTextoDocs} configurada={configurada} lendo={lendo} progresso={progresso} erro={erroIA} onLer={lerComIA} onCancelar={cancelarLeitura} />
                            <AvisoPartesFalhas falhas={falhas} lendo={lendo} onTentarDeNovo={tentarDeNovo} />
                            {previa.length > 0 && <button type="button" onClick={() => setFase(3)} style={{ width: '100%', marginTop: '10px', padding: '8px' }}>Ver prévia ({previa.length})</button>}
                            <LerDeImagemIA montarPrompt={() => montarPromptImportacao(TEXTO_DAS_IMAGENS, abaAtual)} onResposta={(texto) => { setJsonResposta(texto); const ok = lerResposta(texto); if (!ok) { setOrigem('manual'); setFase(2); } return ok; }} />
                            <details className="importador-ia-manual" open={!configurada || undefined}>
                                <summary>Modo manual (avançado)</summary>
                                <div className="importador-ia-dica">Sem usar a chave da mesa: copie a instrução, leve a uma IA de sua escolha e cole aqui o JSON que ela devolver.</div>
                                <button type="button" onClick={gerarPrompt} style={{ width: '100%', marginTop: '10px', padding: '8px' }}>1. Copiar Feitiço de Extração (Prompt)</button>
                            </details>
                        </>
                    ) : fase === 3 ? (
                        <>
                            <AvisoPartesFalhas falhas={falhas} lendo={lendo} onTentarDeNovo={tentarDeNovo} />
                            {lendo && progresso && <div className="importador-ia-progresso" role="status" aria-live="polite">{progresso.texto} <button type="button" className="importador-ia-cancelar" onClick={cancelarLeitura}>Cancelar</button></div>}
                            {erroIA && <div className="importacao-aviso" role="alert">⚠️ {erroIA}</div>}
                            <ImportadorPrevia
                                itens={previa}
                                onAtualizar={(chave, novo) => setPrevia(atual => atual.map(it => (it.chave === chave ? novo : it)))}
                                onRemover={(chave) => { const resto = previa.filter(it => it.chave !== chave); setPrevia(resto); if (resto.length === 0) setFase(faseDeVolta); }}
                                onConfirmar={gravarPrevia}
                                onVoltar={() => setFase(faseDeVolta)}
                                onAdicionarOutra={() => setFase(faseDeVolta)}
                            />
                        </>
                    ) : (
                        <>
                            <textarea readOnly value={promptGerado} onFocus={e => e.target.select()} aria-label="Instrução para a IA" style={{ width: '100%', height: '60px', background: 'transparent', padding: '10px', marginBottom: '10px', fontSize: '0.8em', opacity: 0.7 }} />
                            <textarea value={jsonResposta} onChange={e => setJsonResposta(e.target.value)} placeholder="Cole o Código Arcano (JSON) devolvido pela IA..." style={{ width: '100%', height: '120px', background: 'transparent', fontFamily: 'monospace', padding: '10px', resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button onClick={() => setFase(1)} style={{ flex: 1, padding: '8px' }}>Voltar</button>
                                {previa.length > 0 && <button onClick={() => setFase(3)} style={{ flex: 1, padding: '8px' }}>Ver prévia ({previa.length})</button>}
                                <button onClick={lerResposta} style={{ flex: 2, padding: '8px' }}>2. Ler resposta e ver a prévia</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// 🔥 SUBSTITUI A SIDEBAR ANTIGA POR UM ÍNDICE NO TOPO DO LIVRO 🔥
export function PoderesNavegacaoLivro({ idBase = 'poderes-categoria' }) {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const { abaAtual, trocarAba } = ctx;

    const abas = [
        { id: 'habilidade', rotulo: '🗡️ Habilidades' },
        { id: 'forma', rotulo: '🎭 Formas' },
        { id: 'poder', rotulo: '✨ Poderes' }
    ];

    // Setas esquerda/direita (e Home/End) movem a seleção e o foco entre as categorias (roving tabindex).
    const aoTeclar = (e) => {
        const idx = Math.max(0, abas.findIndex(a => a.id === abaAtual));
        let prox = -1;
        if (e.key === 'ArrowRight') prox = (idx + 1) % abas.length;
        else if (e.key === 'ArrowLeft') prox = (idx - 1 + abas.length) % abas.length;
        else if (e.key === 'Home') prox = 0;
        else if (e.key === 'End') prox = abas.length - 1;
        if (prox < 0) return;
        e.preventDefault();
        trocarAba(abas[prox].id);
        const el = document.getElementById(`${idBase}-aba-${abas[prox].id}`);
        if (el) el.focus();
    };

    return (
        <div className="grimorio-abas grimorio-abas--categorias" role="tablist" aria-label="Categorias do Livro dos Poderes" onKeyDown={aoTeclar}>
            {abas.map(a => (
                <button key={a.id} id={`${idBase}-aba-${a.id}`} type="button" role="tab" aria-selected={abaAtual === a.id} aria-controls={`${idBase}-painel`} tabIndex={abaAtual === a.id ? 0 : -1} className={`grimorio-aba${abaAtual === a.id ? ' ativa' : ''}`} onClick={() => trocarAba(a.id)}>
                    {a.rotulo}
                </button>
            ))}
        </div>
    );
}

// Seção recolhível do formulário: o corpo fica SEMPRE montado (só escondido por CSS), então o estado e os campos
// não se perdem ao recolher. O cabeçalho mostra um resumo do que está preenchido e um aviso, se houver.
function SecaoForm({ id, titulo, resumo, erro, aberta, onAlternar, children }) {
    const uid = useId();
    const idCorpo = `grimorio-form-secao-${id}-${uid}`;
    return (
        <section className={`grimorio-form-secao${aberta ? ' aberta' : ''}${erro ? ' com-erro' : ''}`}>
            <button type="button" className="grimorio-form-secao-cab" aria-expanded={!!aberta} aria-controls={idCorpo} onClick={onAlternar}>
                <span className="grimorio-form-secao-seta" aria-hidden="true">{aberta ? '▾' : '▸'}</span>
                <span className="grimorio-form-secao-titulo">{titulo}</span>
                {resumo ? <span className="grimorio-form-secao-resumo">{resumo}</span> : null}
                {erro ? <span className="grimorio-form-secao-erro" role="status">⚠ {erro}</span> : null}
            </button>
            <div id={idCorpo} className="grimorio-form-secao-corpo">
                {children}
            </div>
        </section>
    );
}

export function PoderesFormEditor() {
    const ctx = usePoderesForm();
    const rascunhoCtx = ctx?.rascunhoAtual;
    // Resumo e "tem algo pra cancelar" só recalculam quando o rascunho muda de referência.
    const resumos = useMemo(() => (rascunhoCtx ? resumirSecoes(rascunhoCtx) : null), [rascunhoCtx]);
    const rascunhoComConteudo = useMemo(() => rascunhoTemConteudo(rascunhoCtx), [rascunhoCtx]);
    if (!ctx) return FALLBACK;
    const {
        abaAtual, poderEditandoId, nomePoder, setNomePoder,
        poderVertente, setPoderVertente, poderElemento, setPoderElemento,
        elementosAfetados, setElementosAfetados,
        imagemUrl, setImagemUrl, uploadingImg, handleImageUpload,
        dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        custoPercentual, setCustoPercentual, custoPercentualMax, setCustoPercentualMax, semComoPoder, setSemComoPoder, danoVerdadeiroPoder, setDanoVerdadeiroPoder, tipoAcao, setTipoAcao, gatilhosPoder, setGatilhosPoder, gatilhosDescartados, usosMaxPoder, setUsosMaxPoder, usosPorPoder, setUsosPorPoder, custoTurnoPoder, setCustoTurnoPoder, recargaTurnosPoder, setRecargaTurnosPoder, escudoPoder, setEscudoPoder, cenaAtivaId, poderAlcance, setPoderAlcance,
        poderArea, setPoderArea, armaVinculada, setArmaVinculada,
        maestriaPoder, setMaestriaPoder, fadigaPorUsoPoder, setFadigaPorUsoPoder,
        maestriaRequeridaPoder, setMaestriaRequeridaPoder,
        pastaPoder, setPastaPoder, pastasExistentes,
        estagiosEditor, setEstagiosEditor,
        descricaoPoder, setDescricaoPoder,
        nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal,
        novoQuando, setNovoQuando, novoEscopo, setNovoEscopo, novoQuandoPassivo, setNovoQuandoPassivo, novoEscopoPassivo, setNovoEscopoPassivo,
        addEfeitoTemp, efeitosTemp, removerEfeitoTemp,
        nomeEfeitoPassivo, setNomeEfeitoPassivo, novoAtrPassivo, setNovoAtrPassivo,
        novoPropPassivo, setNovoPropPassivo, novoValPassivo, setNovoValPassivo,
        addEfeitoPassivoTemp, efeitosTempPassivos, removerEfeitoPassivoTemp,
        salvarNovoPoder, cancelarEdicaoComConfirmacao, formRef, minhaFicha,
        secoesAbertas, setSecoesAbertas, rascunhoAtual
    } = ctx;

    const sing = SINGULAR[abaAtual] || 'Poder/Habilidade';
    const abertas = secoesAbertas || {};
    const todasAbertas = SECOES_FORM.every(id => abertas[id]);
    const alternar = (id) => setSecoesAbertas({ ...abertas, [id]: !abertas[id] });
    const alternarTodas = () => setSecoesAbertas(SECOES_FORM.reduce((acc, id) => ({ ...acc, [id]: !todasAbertas }), {}));
    const secao = (id, titulo, filhos) => (
        <SecaoForm id={id} titulo={titulo} resumo={resumos[id].resumo} erro={resumos[id].erro} aberta={!!abertas[id]} onAlternar={() => alternar(id)}>
            {filhos}
        </SecaoForm>
    );
    const temAlgoPraCancelar = !!poderEditandoId || rascunhoComConteudo;

    return (
        <div ref={formRef} className="grimorio-form">
            <div className={`grimorio-form-banner${poderEditandoId ? ' editando' : ''}`}>
                <h3 className="grimorio-form-titulo">{poderEditandoId ? `✎ Reescrevendo: ${nomePoder}` : `✎ Criar Novo(a) ${sing}`}</h3>
                <div className="grimorio-form-banner-acoes">
                    {poderEditandoId && <button type="button" className="btn-neon btn-red grimorio-btn grimorio-btn--sm grimorio-form-btn-cancelar-edicao" onClick={cancelarEdicaoComConfirmacao}>✖ Cancelar edição</button>}
                    <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm grimorio-form-btn-expandir" onClick={alternarTodas}>{todasAbertas ? 'Recolher tudo' : 'Expandir tudo'}</button>
                </div>
            </div>

            {/* BÁSICO: o que identifica a técnica */}
            {secao('basico', '📖 Básico', (
                <div className="grimorio-form-grade">
                    <label className="grimorio-form-campo grimorio-form-span-tudo">
                        <span className="grimorio-form-rotulo">Nome</span>
                        <input type="text" className="grimorio-form-nome" placeholder="Nome (Ex: Chama Imortal)" value={nomePoder} onChange={e => setNomePoder(e.target.value)} />
                    </label>
                    <label className="grimorio-form-campo grimorio-form-span2">
                        <span className="grimorio-form-rotulo">Natureza da Magia</span>
                        <select value={poderVertente} onChange={e => setPoderVertente(e.target.value)}>
                            <option value="">Padrão (Dano / Efeito Direto)</option>
                            <option value="Acumulativo">📈 Acumulativo (Requer Marcadores/Forja)</option>
                            <option value="Elemental">🌪️ Elemental (Ressonância Ativa)</option>
                            <option value="Conceitual">🧩 Conceitual (Distorção de Regras)</option>
                            <option value="Utilitario">🛠️ Utilitário (Cópia / Suporte)</option>
                        </select>
                    </label>
                    {(poderVertente || '').toLowerCase().includes('elemental') && (
                        <>
                            <label className="grimorio-form-campo grimorio-form-span2 fade-in">
                                <span className="grimorio-form-rotulo">Elemento Principal</span>
                                <select value={poderElemento} onChange={e => setPoderElemento(e.target.value)}>
                                    <option value="">Selecione a raiz elemental...</option>
                                    {ELEMENTOS_OPCOES.map(grupo => (
                                        <optgroup key={grupo.label} label={grupo.label}>
                                            {grupo.opcoes.map(el => <option key={el} value={el}>{rotuloComPolaridade(el)}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </label>
                            <label className="grimorio-form-campo grimorio-form-span2 fade-in">
                                <span className="grimorio-form-rotulo">Afeta/Consome</span>
                                <input type="text" placeholder="Quais elementos engole?" value={elementosAfetados} onChange={e => setElementosAfetados(e.target.value)} />
                            </label>
                        </>
                    )}
                    <div className="grimorio-form-campo grimorio-form-span-tudo">
                        <span className="grimorio-form-rotulo">Imagem</span>
                        <div className="grimorio-form-imagem">
                            <input type="text" placeholder="URL da Imagem..." value={imagemUrl} onChange={e => setImagemUrl(e.target.value)} />
                            <label className={`grimorio-form-anexar${uploadingImg ? ' enviando' : ''}`}>
                                {uploadingImg ? 'Enviando...' : '📁 Anexar'}
                                <input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageUpload} className="grimorio-form-arquivo" disabled={uploadingImg} />
                            </label>
                        </div>
                    </div>
                    <label className="grimorio-form-campo grimorio-form-span-tudo">
                        <span className="grimorio-form-rotulo">Descrição</span>
                        <textarea className="grimorio-form-descricao" placeholder="Descrição / Efeito Narrativo..." value={descricaoPoder} onChange={e => setDescricaoPoder(e.target.value)} />
                    </label>
                </div>
            ))}

            {/* COMBATE: dados, custo, alcance e ação */}
            {secao('combate', '⚔️ Combate', (
                <div className="grimorio-form-grade">
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Qtd Dados</span><input type="number" min="0" value={dadosQtd} onChange={e => setDadosQtd(e.target.value)} className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Faces (d)</span><input type="number" min="1" value={dadosFaces} onChange={e => setDadosFaces(e.target.value)} className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Custo (%)</span><input type="number" min="0" value={custoPercentual} onChange={e => setCustoPercentual(e.target.value)} className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Custo Máx (%)</span><input type="number" min="0" value={custoPercentualMax} onChange={e => setCustoPercentualMax(e.target.value)} title="Margem de Custo: do Custo (%) até este máximo. Vale ao conjurar como Poder." className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Alcance (Q)</span><input type="number" min="0" step="0.5" value={poderAlcance} onChange={e => setPoderAlcance(e.target.value)} className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo"><span className="grimorio-form-rotulo">Área (Q)</span><input type="number" min="0" step="0.5" value={poderArea} onChange={e => setPoderArea(e.target.value)} className="grimorio-form-num" /></label>
                    <label className="grimorio-form-campo grimorio-form-span2">
                        <span className="grimorio-form-rotulo">Ação gasta</span>
                        <select value={tipoAcao} onChange={e => setTipoAcao(e.target.value)} title="Que tipo de Ação custa usar esta técnica (o sistema desconta Ação, Ação Bônus e Reação). Automático: se a técnica eleva o Poder Calculado, ligar gasta uma Reação; escolha Ação Livre para ligar de graça.">{TIPOS_ACAO_TECNICA.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select>
                    </label>
                    <label className="grimorio-form-campo grimorio-form-span2">
                        <span className="grimorio-form-rotulo">Arma (Opc.)</span>
                        <select value={armaVinculada} onChange={e => setArmaVinculada(e.target.value)}>
                            <option value="">Livre</option>
                            {(minhaFicha?.inventario || []).filter(i => i.tipo === 'arma').map(arma => (
                                <option key={arma.id} value={String(arma.id)}>{arma.nome}</option>
                            ))}
                        </select>
                    </label>
                    <div className="grimorio-form-campo grimorio-form-span2">
                        <span className="grimorio-form-rotulo">Como Poder</span>
                        <label className="grimorio-form-check"><input type="checkbox" checked={!!semComoPoder} onChange={e => setSemComoPoder(e.target.checked)} /> Vetar</label>
                    </div>
                    <div className="grimorio-form-campo grimorio-form-span2">
                        <span className="grimorio-form-rotulo">Tipo de dano</span>
                        <label className="grimorio-form-check"><input type="checkbox" checked={!!danoVerdadeiroPoder} onChange={e => setDanoVerdadeiroPoder(e.target.checked)} title="Ignora quaisquer resistências e imunidades do alvo ao usar este poder em um golpe." /> 💀 Este poder causa Dano Verdadeiro</label>
                    </div>
                </div>
            ))}

            {/* EFEITOS: matemática ativa e passiva */}
            {secao('efeitos', '➕ Efeitos', (
                <>
                    {/* 🎯 BONUS_ACERTO (pedido do usuário): bônus de Acerto que só conta enquanto ESTA
                        Habilidade específica estiver "★ ATIVADA" -- ligue-a antes de rolar Acerto pelo ataque
                        que ela representa, e desligue depois, pra não ficar somando em outros ataques. Some-se
                        com o de outras Habilidades que também estejam Ativas ao mesmo tempo (ver
                        core/attributes.js > getPoderesDefesa), então mantenha só a do ataque em uso ligada. */}
                    <div className="grimorio-form-bloco-titulo">
                        <h4>➕ Efeitos Matemáticos Ativos</h4>
                        <details className="grimorio-form-ajuda">
                            <summary aria-label="Ajuda sobre os efeitos" title="Ajuda sobre os efeitos">?</summary>
                            <p>Dica: use a propriedade BONUS_ACERTO pra um bônus de Acerto que só vale enquanto esta Habilidade estiver "★ Ativada" (ligue antes do ataque, desligue depois). Para dar uma Reação à técnica, escolha um atributo ↩️ REAÇÕES (quando usar) e, em propriedade, o que ela faz; o valor é a % (REDUZIR_DANO) ou o +N (AUMENTAR_CA), nos outros use 0. Efeito Passivo vale sempre; Ativo só com a técnica ligada. Os atributos 🔍 IDENTIFICAÇÃO (propriedade BASE, valor 0) fazem a técnica revelar o tipo do ataque recebido (Físico/Energético/Elemento) e a Energia gasta nele.</p>
                        </details>
                    </div>
                    <input type="text" className="grimorio-form-efeito-nome" placeholder="Nome do Efeito" value={nomeEfeito} onChange={e => setNomeEfeito(e.target.value)} />
                    <div className="grimorio-form-efeito-linha">
                        <select value={novoAtr} onChange={e => { setNovoAtr(e.target.value); setNovoProp(ajustarPropriedade(e.target.value, novoProp)); }}>
                            {ATRIBUTOS_PODERES.map(grupo => (
                                <optgroup key={grupo.label} label={grupo.label}>
                                    {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <select value={novoProp} onChange={e => setNovoProp(e.target.value)}>
                            {getPropriedadesDoAtributo(novoAtr).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                        </select>
                        <input type="text" className="grimorio-form-efeito-valor" placeholder="Valor" value={novoVal} onChange={e => setNovoVal(e.target.value)} />
                        <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm grimorio-form-efeito-add" onClick={addEfeitoTemp} title="Adicionar efeito ativo">+</button>
                    </div>
                    <CondicaoDoEfeito atributo={novoAtr} propriedade={novoProp} quando={novoQuando} onQuando={setNovoQuando} escopo={novoEscopo} onEscopo={setNovoEscopo} />

                    <div className="grimorio-form-efeito-lista">
                        {efeitosTemp.map((e, i) => {
                            const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes((e.propriedade || '').toLowerCase());
                            return (
                                <div key={i} className="grimorio-form-efeito-item">
                                    <span><strong>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] - [{(e.propriedade || '').toUpperCase()}]: <strong>{isMult ? '(x)' : '(+)'} {e.valor}</strong>{textoCondicaoEfeito(e)}</span>
                                    <button type="button" className="grimorio-form-efeito-remover" onClick={() => removerEfeitoTemp(i)} title="Remover efeito">✖</button>
                                </div>
                            );
                        })}
                    </div>

                    {/* SEÇÃO MATEMÁTICA PASSIVA */}
                    <div className="grimorio-form-bloco-titulo separado">
                        <h4>🛡️ Efeitos Passivos (Sempre Ligados)</h4>
                    </div>
                    <input type="text" className="grimorio-form-efeito-nome" placeholder="Nome do Efeito Passivo" value={nomeEfeitoPassivo} onChange={e => setNomeEfeitoPassivo(e.target.value)} />
                    <div className="grimorio-form-efeito-linha">
                        <select value={novoAtrPassivo} onChange={e => { setNovoAtrPassivo(e.target.value); setNovoPropPassivo(ajustarPropriedade(e.target.value, novoPropPassivo)); }}>
                            {ATRIBUTOS_PODERES.map(grupo => (
                                <optgroup key={grupo.label} label={grupo.label}>
                                    {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <select value={novoPropPassivo} onChange={e => setNovoPropPassivo(e.target.value)}>
                            {getPropriedadesDoAtributo(novoAtrPassivo).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                        </select>
                        <input type="text" className="grimorio-form-efeito-valor" placeholder="Valor" value={novoValPassivo} onChange={e => setNovoValPassivo(e.target.value)} />
                        <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm grimorio-form-efeito-add" onClick={addEfeitoPassivoTemp} title="Adicionar efeito passivo">+</button>
                    </div>
                    <CondicaoDoEfeito atributo={novoAtrPassivo} propriedade={novoPropPassivo} quando={novoQuandoPassivo} onQuando={setNovoQuandoPassivo} escopo={novoEscopoPassivo} onEscopo={setNovoEscopoPassivo} />

                    <div className="grimorio-form-efeito-lista">
                        {efeitosTempPassivos.map((e, i) => {
                            const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes((e.propriedade || '').toLowerCase());
                            return (
                                <div key={i} className="grimorio-form-efeito-item passivo">
                                    <span>[PASSIVO] <strong>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] - [{(e.propriedade || '').toUpperCase()}]: <strong>{isMult ? '(x)' : '(+)'} {e.valor}</strong>{textoCondicaoEfeito(e)}</span>
                                    <button type="button" className="grimorio-form-efeito-remover" onClick={() => removerEfeitoPassivoTemp(i)} title="Remover efeito passivo">✖</button>
                                </div>
                            );
                        })}
                    </div>
                </>
            ))}

            {/* GATILHOS: o editor ocupa a largura toda da seção */}
            {secao('gatilhos', '🔔 Gatilhos', (
                <GatilhosEditor gatilhos={gatilhosPoder} onChange={setGatilhosPoder} descartados={gatilhosDescartados} contadores={minhaFicha?.contadores} poderes={minhaFicha?.poderes} />
            ))}

            {/* AVANÇADO: usos, recarga, escudo, estágios, maestria e pasta */}
            {secao('avancado', '⚙️ Avançado', (
                <>
                    <div className="grimorio-form-grade">
                        <div className="grimorio-form-campo grimorio-form-span2">
                            <span className="grimorio-form-rotulo">Usos</span>
                            <div className="usos-poder-campo"><input type="number" min="0" max="99" placeholder="∞" aria-label="Usos máximos (vazio = ilimitado)" value={usosMaxPoder} onChange={e => setUsosMaxPoder(e.target.value)} title="Quantas vezes pode ser ligada. Vazio ou 0 = ilimitado." /><select aria-label="Os usos renovam" value={usosPorPoder} onChange={e => setUsosPorPoder(e.target.value)} title="Quando os usos renovam: ao trocar de cena (ou descansar) ou só ao descansar."><option value="cena">por cena</option><option value="descanso">por descanso</option></select></div>
                        </div>
                        <div className="grimorio-form-campo grimorio-form-span2">
                            <span className="grimorio-form-rotulo">Recarga (turnos)</span>
                            <input type="number" min="0" max="99" placeholder="0" aria-label="Recarga em turnos (0 = sem recarga)" value={recargaTurnosPoder} onChange={e => setRecargaTurnosPoder(e.target.value)} title="Turnos do dono a esperar depois de ligar antes de poder ligar de novo. Vazio ou 0 = sem recarga." className="grimorio-form-num" />
                        </div>
                        <div className="grimorio-form-campo grimorio-form-span-tudo">
                            <span className="grimorio-form-rotulo">Custo por turno ligado</span>
                            <div className="custo-turno-campo"><input type="number" min="0" placeholder="0" aria-label="Custo por turno (vazio = sem custo)" value={custoTurnoPoder.valor} onChange={e => setCustoTurnoPoder({ ...custoTurnoPoder, valor: e.target.value })} title="Energia cobrada no início de cada turno enquanto o Poder está ligado. Vazio ou 0 = sem custo. Sem energia, o Poder desliga." /><select aria-label="Modo do custo por turno" value={custoTurnoPoder.modo} onChange={e => setCustoTurnoPoder({ ...custoTurnoPoder, modo: e.target.value })}><option value="fixo">fixo</option><option value="percMax">% do máx.</option></select><select aria-label="Energia do custo por turno" value={custoTurnoPoder.energia} onChange={e => setCustoTurnoPoder({ ...custoTurnoPoder, energia: e.target.value })}>{ENERGIAS_CUSTO.map(en => <option key={en} value={en}>{en}</option>)}</select></div>
                        </div>
                        <div className="grimorio-form-campo grimorio-form-span-tudo">
                            <span className="grimorio-form-rotulo">Escudo ao ligar</span>
                            <div className="escudo-poder-campo"><input type="text" maxLength={40} placeholder="Nome (ex.: Domo Gélido)" aria-label="Nome do escudo que o Poder cria ao ligar" value={escudoPoder.nome} onChange={e => setEscudoPoder({ ...escudoPoder, nome: e.target.value })} /><input type="number" min="0" placeholder="0" aria-label="Valor do escudo (vazio = sem escudo)" value={escudoPoder.valor} onChange={e => setEscudoPoder({ ...escudoPoder, valor: e.target.value })} title="Barreira criada ao ligar e removida ao desligar. Vazio ou 0 = sem escudo." /><select aria-label="Tipo do escudo" value={escudoPoder.tipo} onChange={e => setEscudoPoder({ ...escudoPoder, tipo: e.target.value })}>{TIPOS_ESCUDO.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select></div>
                        </div>
                        {abaAtual === 'forma' && (
                            <div className="grimorio-form-campo grimorio-form-campo-destaque fade-in">
                                <label className="grimorio-form-rotulo" title="Define até quanto de Poder liberado (Supressão) o personagem pode usar com esta Forma ativa sem acumular Fadiga. 100% = Forma dominada, nunca gera Fadiga por Poder.">🥋 Maestria (%)</label>
                                <input
                                    type="number" min="0" max="100" value={maestriaPoder} className="grimorio-form-num"
                                    onChange={e => { const v = parseFloat(e.target.value); setMaestriaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                />
                            </div>
                        )}
                        {abaAtual === 'forma' && (
                            <div className="grimorio-form-campo grimorio-form-campo-alerta fade-in">
                                <label className="grimorio-form-rotulo" title="O quanto esta Forma pesa na Fadiga dinâmica quando usada ACIMA da própria Maestria. Padrão: 15.">😮‍💨 Fadiga por Uso</label>
                                <input
                                    type="number" min="0" value={fadigaPorUsoPoder} className="grimorio-form-num"
                                    onChange={e => { const v = parseFloat(e.target.value); setFadigaPorUsoPoder(isNaN(v) ? 0 : Math.max(0, v)); }}
                                />
                            </div>
                        )}
                        {(abaAtual === 'habilidade' || abaAtual === 'poder') && (
                            <div className="grimorio-form-campo grimorio-form-campo-destaque fade-in">
                                <label className="grimorio-form-rotulo" title={`O quanto o personagem já domina ESTE(A) ${sing} especificamente.`}>🎓 Maestria (%)</label>
                                <input
                                    type="number" min="0" max="100" value={maestriaPoder} className="grimorio-form-num"
                                    onChange={e => { const v = parseFloat(e.target.value); setMaestriaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                />
                            </div>
                        )}
                        {(abaAtual === 'habilidade' || abaAtual === 'poder') && (
                            <div className="grimorio-form-campo grimorio-form-campo-alerta fade-in">
                                <label className="grimorio-form-rotulo" title={`Maestria mínima exigida pra usar este(a) ${sing} sem gerar Fadiga extra. 0 = sem requisito (padrão).`}>🎯 Maestria Requerida (%)</label>
                                <input
                                    type="number" min="0" max="100" value={maestriaRequeridaPoder} className="grimorio-form-num"
                                    onChange={e => { const v = parseFloat(e.target.value); setMaestriaRequeridaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                />
                            </div>
                        )}
                        <label className="grimorio-form-campo grimorio-form-span-tudo fade-in" title="Organize Formas, Habilidades e Poderes em pastas. Selecione uma existente ou digite um nome novo. Use / para criar subpastas: Taijutsu/Portões coloca a pasta Portões dentro de Taijutsu.">
                            <span className="grimorio-form-rotulo">🗂️ Pasta (Opc.) — use / para subpastas</span>
                            <input
                                type="text" list="pastas-formas-datalist" placeholder="Sem pasta  (ex.: Taijutsu/Portões)"
                                value={pastaPoder} onChange={e => setPastaPoder(e.target.value)}
                            />
                            <datalist id="pastas-formas-datalist">
                                {(pastasExistentes || []).map(nome => <option key={nome} value={nome} />)}
                            </datalist>
                        </label>
                    </div>

                    {/* 🪜 ESTÁGIOS: Portões Internos (1º ao 10º), Kaioken (sem limite)... numa técnica só */}
                    <div className={`estagios-editor${estagiosEditor.habilitado ? ' ligado' : ''}`}>
                        <label className="estagios-editor-ligar">
                            <input
                                type="checkbox"
                                checked={!!estagiosEditor.habilitado}
                                onChange={e => setEstagiosEditor({ habilitado: e.target.checked })}
                            />
                            🪜 Esta técnica tem Estágios <span className="estagios-editor-dica">(ex.: Portões Internos, Kaioken)</span>
                        </label>
                        {estagiosEditor.habilitado && (
                            <div className="fade-in">
                                <p className="estagios-editor-explica">
                                    Os <strong>Efeitos Matemáticos Ativos</strong> (seção Efeitos) valem para o 1º estágio. Cada estágio acima soma o crescimento sobre eles, e a Fadiga por turno no Mapa aumenta a cada estágio.
                                </p>
                                <div className="estagios-editor-campos">
                                    <label>
                                        <span>Nome do estágio</span>
                                        <input type="text" placeholder="Ex: Portão" value={estagiosEditor.rotulo} onChange={e => setEstagiosEditor({ rotulo: e.target.value })} />
                                    </label>
                                    <label title="0 = sem limite (ex.: Kaioken)">
                                        <span>Último estágio (0 = ∞)</span>
                                        <input type="number" min="0" value={estagiosEditor.maximo} onChange={e => setEstagiosEditor({ maximo: e.target.value })} />
                                    </label>
                                    <label title="Quanto dos efeitos do 1º estágio cada estágio acima soma. 100% = 2º dobra, 3º triplica.">
                                        <span>Crescimento por estágio (%)</span>
                                        <input type="number" min="0" value={estagiosEditor.crescimento} onChange={e => setEstagiosEditor({ crescimento: e.target.value })} />
                                    </label>
                                    <label title="Fadiga somada a cada início de turno no Mapa, multiplicada pelo estágio atual.">
                                        <span>😮‍💨 Fadiga por estágio (%/turno)</span>
                                        <input type="number" min="0" step="0.5" value={estagiosEditor.fadigaPorEstagio} onChange={e => setEstagiosEditor({ fadigaPorEstagio: e.target.value })} />
                                    </label>
                                </div>
                                <label className="estagios-editor-nomes">
                                    <span>Nome de cada estágio (opcional, um por linha)</span>
                                    <textarea
                                        placeholder={'Portão da Abertura\nPortão do Descanso\nPortão da Vida'}
                                        value={estagiosEditor.nomes}
                                        onChange={e => setEstagiosEditor({ nomes: e.target.value })}
                                    />
                                </label>
                                <EstagiosMarcosEditor
                                    estagiosEditor={estagiosEditor}
                                    setEstagiosEditor={setEstagiosEditor}
                                    efeitosBase={efeitosTemp}
                                    atributos={ATRIBUTOS_PODERES.filter(g => g !== GRUPO_REACOES && g !== GRUPO_IDENTIFICACAO)}
                                    propriedades={PROPRIEDADE_OPTIONS}
                                />
                                <PreviaEstagios efeitosBase={efeitosTemp} estagiosEditor={estagiosEditor} />
                            </div>
                        )}
                    </div>
                </>
            ))}

            {/* Barra de ações fixa no rodapé do formulário: sempre à vista, mesmo com tudo aberto */}
            <div className="grimorio-form-acoes">
                <button type="button" className="btn-neon btn-green grimorio-btn grimorio-form-btn-gravar" onClick={salvarNovoPoder}>{poderEditandoId ? '✍️ Concluir Revisão' : `📜 Gravar no Grimório`}</button>
                {temAlgoPraCancelar && <button type="button" className="btn-neon grimorio-btn grimorio-form-btn-cancelar" onClick={cancelarEdicaoComConfirmacao}>Cancelar</button>}
            </div>
        </div>
    );
}

// 🗂️ Nome do "bucket" pra itens sem pasta atribuída — nunca colide com um nome de pasta real
// porque pastaPoder é sempre .trim()'ado antes de salvar (nunca fica só espaços).
const SEM_PASTA = NOME_SEM_PASTA;

// 🗂️ Plural com artigo de cada categoria, pro texto do prompt de renomear pasta (Pasta deixou de
// ser exclusiva de Forma — este texto não pode mais dizer "Formas" fixo quando quem está
// renomeando está na aba Habilidades ou Poderes).
const PLURAL_COM_ARTIGO = { habilidade: 'as Habilidades', forma: 'as Formas', poder: 'os Poderes' };

export function PoderesLista() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const {
        abaAtual, itensFiltrados, poderPreparandoId, setPoderPreparandoId,
        setOverchargeAtivo, togglePoder, vincularAberto, setVincularAberto,
        vincularRef, minhaFicha, cenaAtivaId, armasEquipadas, vincularArmaAoPoder,
        editarPoder, deletarPoder, overchargeAtivo, curMana, curAura, curChakra,
        energiaElemental, danoBruto, dispararAtaque,
        salvarFormaPoder, deletarFormaPoder, ativarFormaPoder,
        renomearPastaForma, pastasAbertas, alternarPasta, definirPastasAbertas, mudarEstagioPoder, isMestre, alternarGatilhoMestre, alternarArmadoGatilho, forcarGatilhoMestre
    } = ctx;

    // 📂 Pastas NASCEM FECHADAS. As abertas ficam na store (provider), por categoria::caminho — sem isso, abrir "Combos"
    // na aba Habilidades também abriria uma pasta "Combos" de outra categoria que reusasse o mesmo nome.
    const alternarAberta = (caminho) => alternarPasta(chavePastaAberta(abaAtual, caminho));

    const sing = SINGULAR[abaAtual] || 'Poder/Habilidade';

    const renomearOuRemoverPasta = (nomeAtual) => {
        const plural = PLURAL_COM_ARTIGO[abaAtual] || 'os itens';
        const novo = window.prompt(`Renomear ou MOVER a pasta "${nomeAtual}" (as subpastas vão junto).\nUse / para subpastas — ex.: Taijutsu/Portões coloca "Portões" dentro de "Taijutsu".\nDeixe em branco pra remover a pasta: ${plural} e as subpastas dela sobem pra pasta-mãe (ou ficam em "${SEM_PASTA}"):`, nomeAtual);
        if (novo === null) return;
        // Escopado só à categoria atual (abaAtual) — renomear uma pasta na aba Habilidades nunca
        // deve afetar sem querer uma Forma/Poder que reusa o mesmo nome de pasta.
        renomearPastaForma(nomeAtual, novo, abaAtual);
    };

    const renderItem = (p) => {
            if (!p) return null;
                    const isEquipped = p.ativa;
                    // Valores já no estágio atual (técnicas com Estágios — core/estagios.js).
                    const txtArr = escalarEfeitosPorEstagio(p.efeitos, p).map(e => {
                        if (!e) return '';
                        return `[${(e.atributo || '').replace('_', ' ').toUpperCase()}] ${(e.propriedade || '').toUpperCase()}: +${e.valor || 0}`;
                    }).filter(Boolean);
                    
                    const pVertenteLower = (p.vertente || '').toLowerCase();
                    
                    const percBase = p.custoPercentual || 0;
                    const percDec = percBase / 100;
                    const manaUsada = Math.floor(curMana * percDec);
                    const auraUsada = Math.floor(curAura * percDec);
                    const chakraUsado = Math.floor(curChakra * percDec);
                    const energiaExtraida = manaUsada + auraUsada + chakraUsado;

                    const overDec = (percBase * 2) / 100;
                    const energiaOver = Math.floor(curMana * overDec) + Math.floor(curAura * overDec) + Math.floor(curChakra * overDec);
                    
                    return (
                        <div key={p.id} className={`grimorio-poder${isEquipped ? ' ativo' : ''}`}>
                            
                            {p.notasIA && (
                                <div className="grimorio-poder-nota">
                                    <strong>Anotação Adicional:</strong> {p.notasIA}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: 0, fontSize: '1.4em', fontWeight: 'bold' }}>
                                        {p.nome || 'Poder'} 
                                        <span style={{fontSize: '0.6em', opacity: 0.6, fontWeight: 'normal'}}> (Alcance: {p.alcance || 1}Q)</span>
                                        {p.vertente && (
                                            <span className="grimorio-selo">
                                                {pVertenteLower.includes('elemental') ? `🌪️ ELEMENTAL: ${p.elemento || '?'}` : p.vertente.toUpperCase()}
                                            </span>
                                        )}
                                        {(p.categoria || '').toLowerCase() === 'forma' && (parseFloat(p.maestria) || 0) > 0 && (
                                            <span className="grimorio-selo grimorio-selo--sucesso" title="Livre de Fadiga por Poder até este tanto de Supressão liberada, enquanto esta Forma estiver ativa">
                                                🥋 {Math.min(100, Math.max(0, parseFloat(p.maestria) || 0))}% MAESTRIA
                                            </span>
                                        )}
                                        {(p.categoria || '').toLowerCase() === 'forma' && (
                                            <span className="grimorio-selo grimorio-selo--aviso" title="Peso de Fadiga gerado por uso acima da Maestria">
                                                😮‍💨 {p.fadigaPorUso !== undefined ? p.fadigaPorUso : 15} FADIGA/USO
                                            </span>
                                        )}
                                    </h3>
                                    
                                    <EstagioControle poder={p} onMudar={mudarEstagioPoder} />

                                    {p.descricao && (
                                        <p style={{ fontSize: '0.9em', fontStyle: 'italic', margin: '8px 0', opacity: 0.8 }}>
                                            "{p.descricao}"
                                        </p>
                                    )}
                                    
                                    {Array.isArray(p.gatilhos) && p.gatilhos.length > 0 && (
                                        <div className="gatilhos-poder-lista">
                                            {p.gatilhos.map(g => (
                                                <div key={g.id} className={"gatilho-poder-linha" + (g.mestreDesligou ? ' desligado-mestre' : '')}>
                                                    <span>🔔 {descreverGatilho(g, { contadores: minhaFicha?.contadores, poderes: minhaFicha?.poderes })}{g.mestreDesligou ? ' (desligado pelo Mestre)' : ''}</span>
                                                    {g.modo === 'opcional' && <button type="button" className={"btn-neon btn-gatilho-armado" + (g.armado !== true ? ' desarmado' : '')} aria-pressed={g.armado === true} onClick={() => alternarArmadoGatilho(p.id, g.id)} title="Opcional: só dispara armado. O dono e o Mestre podem alternar.">{g.armado !== true ? '🔕 Desarmado' : '🔔 Armado'}</button>}
                                                    {isMestre && <button type="button" className="btn-neon" onClick={() => forcarGatilhoMestre(p.id, g.id)} title="Executa as ações agora, ignorando condições e limite (só o Mestre)">Forçar disparo</button>}
                                                    {isMestre && <button type="button" className="btn-neon" onClick={() => alternarGatilhoMestre(p.id, g.id)} title="Liga ou desliga este gatilho (só o Mestre)">{g.mestreDesligou ? 'Religar' : 'Desligar'}</button>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {p.elementosAfetados && (
                                        <p style={{ fontSize: '0.85em', margin: '4px 0', fontWeight: 'bold', opacity: 0.9 }}>
                                            🌊 Consome/Afeta: {p.elementosAfetados}
                                        </p>
                                    )}

                                    <div style={{ fontSize: '0.85em', marginTop: '10px', opacity: 0.7, borderTop: '1px dotted currentColor', paddingTop: '5px' }}>
                                        <strong>Mecânica:</strong> {txtArr.join(' | ') || 'Sem bônus matemático.'}
                                        {(p.efeitosPassivos || []).length > 0 && (
                                            <span style={{ display: 'block', marginTop: '4px', fontStyle: 'italic' }}>
                                                {(p.efeitosPassivos || []).map(e => {
                                                    if (!e) return '';
                                                    return `[PASSIVO] [${(e.atributo || '').replace('_', ' ').toUpperCase()}] ${(e.propriedade || '').toUpperCase()}: +${e.valor || 0}`;
                                                }).filter(Boolean).join(' | ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: '120px' }}>
                                    
                                    {/* BOTÃO ATIVAR/DESATIVAR MAGIA COMPLETA */}
                                    <button
                                        type="button"
                                        className={`btn-neon grimorio-btn${isEquipped ? ' btn-green' : ''}`}
                                        aria-pressed={!!isEquipped}
                                        onClick={() => togglePoder(p.id)}
                                    >
                                        {isEquipped ? '★ ATIVADA' : 'Desativada'}
                                    </button>
                                    {descreverOrigem(p.origem) && <span className="origem-poder-selo" title="Origem do poder (informativa)">{descreverOrigem(p.origem)}</span>}
                                    {descreverUsos(minhaFicha, p, cenaAtivaId) && <span className="usos-poder-selo" title="Usos restantes desta técnica">🔁 {descreverUsos(minhaFicha, p, cenaAtivaId)}</span>}
                                    {descreverCustoPorTurno(p) && <span className="custo-turno-selo" title="Energia cobrada no início de cada turno enquanto ligada">🔋 {descreverCustoPorTurno(p)}</span>}
                                    {descreverRecarga(p) && <span className={`recarga-poder-selo${p.recargaRestante > 0 ? ' em-recarga' : ''}`} title="Recarga em turnos antes de ligar de novo">{descreverRecarga(p)}</span>}

                                    {/* BOTÃO DISPARAR/PREPARAR MODO */}
                                    <button
                                        type="button"
                                        className={`btn-neon grimorio-btn${poderPreparandoId === p.id ? ' btn-blue' : ''}`}
                                        aria-pressed={poderPreparandoId === p.id}
                                        onClick={() => {
                                            if (poderPreparandoId === p.id) { setPoderPreparandoId(null); } 
                                            else { setPoderPreparandoId(p.id); setOverchargeAtivo(false); }
                                        }}
                                    >
                                        ⚔️ PREPARAR AÇÃO
                                    </button>
                                    
                                    <div style={{ position: 'relative' }} ref={vincularAberto === p.id ? vincularRef : null}>
                                        <button
                                            type="button"
                                            className={`btn-neon grimorio-btn grimorio-btn--sm${p.armaVinculada ? ' btn-gold' : ''}`}
                                            aria-expanded={vincularAberto === p.id}
                                            onClick={() => setVincularAberto(vincularAberto === p.id ? null : p.id)}
                                        >
                                            {p.armaVinculada ? `🔗 ${((minhaFicha?.inventario || []).find(i => String(i.id) === String(p.armaVinculada))?.nome) || 'Arma'}` : 'Vincular a Arma'}
                                        </button>
                                        {vincularAberto === p.id && (
                                            <div className="grimorio-vincular-menu">
                                                <button type="button" className="grimorio-vincular-item" onClick={() => vincularArmaAoPoder(p.id, '')}>
                                                    Nenhuma (Livre)
                                                </button>
                                                {armasEquipadas.map(arma => (
                                                    <button key={arma.id} type="button" className={`grimorio-vincular-item${String(p.armaVinculada) === String(arma.id) ? ' ativo' : ''}`} onClick={() => vincularArmaAoPoder(p.id, String(arma.id))}>
                                                        ⚔️ {arma.nome}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="grimorio-poder-acoes-linha">
                                        <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm" onClick={() => editarPoder(p.id)}>Reescrever</button>
                                        <button type="button" className="btn-neon btn-red grimorio-btn grimorio-btn--sm" onClick={() => deletarPoder(p.id)}>Rasgar</button>
                                    </div>
                                    <EnsinarBotao tipo="poder" item={p} />
                                </div>
                            </div>
                            
                            <DescricoesAtaqueEditor colecao="poderes" itemId={p.id} />
                            <EstadosGolpeEditor colecao="poderes" itemId={p.id} comReflexo />
                            <SuporteEditor colecao="poderes" itemId={p.id} />
                            <AoAcertarEditor colecao="poderes" itemId={p.id} />

                            {/* CAIXA DE DISPARO */}
                            {poderPreparandoId === p.id && (
                                <div className="fade-in grimorio-disparo">
                                    <h4 style={{ margin: '0 0 10px 0', opacity: 0.9 }}>⚙️ Central de Disparo: {p.nome}</h4>

                                    {pVertenteLower.includes('elemental') ? (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px' }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>🌪️ RESSONÂNCIA ELEMENTAL</p>
                                            <p style={{ fontSize: '0.85em', margin: 0, opacity: 0.8 }}>
                                                A Força da Natureza funde {p.custoPercentual}% das suas energias.<br/>
                                                <span>Mana ({manaUsada})</span> + <span>Aura ({auraUsada})</span> + <span>Chakra ({chakraUsado})</span><br/>
                                                <strong>Poder Bruto Extraído: <span>+{energiaExtraida}</span> de Dano.</strong><br/>
                                                Custo Cobrado na Ficha: <strong>ZERO (Gratuito)</strong>.
                                            </p>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer', background: overchargeAtivo ? 'rgba(0,0,0,0.1)' : 'transparent', padding: '10px', border: '1px dashed currentColor', opacity: overchargeAtivo ? 1 : 0.6 }}>
                                                <input type="checkbox" checked={overchargeAtivo} onChange={e => setOverchargeAtivo(e.target.checked)} style={{ transform: 'scale(1.3)' }} />
                                                <div>
                                                    <div style={{ fontWeight: 'bold' }}>🔥 MODO OVERCHARGE (Queimar Motor)</div>
                                                    <div style={{ fontSize: '0.8em' }}>
                                                        Dobra a energia extraída (<strong>+{energiaOver}</strong> Dano Bruto)! <br/>
                                                        ⚠️ Mas você <strong>pagará {percBase * 2}%</strong> da sua Mana, Aura e Chakra atuais como custo!
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    ) : pVertenteLower.includes('acumulativo') ? (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px', opacity: 0.8 }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>📈 TÉCNICA ACUMULATIVA</p>
                                            <p style={{ fontSize: '0.85em', margin: 0 }}>
                                                Use os Marcadores de Cena ou a Forja Pós-Combate (Aba Ficha) para processar os ganhos de atributos desta habilidade.<br/>
                                                Custo Padrão: <strong>{p.custoPercentual}% das Energias</strong>. <br/>
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px', opacity: 0.8 }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>🎯 Disparo Padrão</p>
                                            <p style={{ fontSize: '0.85em', margin: 0 }}>
                                                Custo: <strong>{p.custoPercentual}% das Energias</strong>. <br/>
                                                Dano Base dos Dados: {p.dadosQtd}d{p.dadosFaces} + Dano Bruto ({danoBruto})
                                            </p>
                                        </div>
                                    )}

                                    {['habilidade', 'poder'].includes((p.categoria || '').toLowerCase()) && (parseFloat(p.maestriaRequerida) || 0) > 0 && (
                                        (() => {
                                            const maestriaAtual = parseFloat(p.maestria) || 0;
                                            const req = parseFloat(p.maestriaRequerida) || 0;
                                            const suficiente = maestriaAtual >= req;
                                            return (
                                                <div className={`grimorio-maestria ${suficiente ? 'grimorio-maestria--ok' : 'grimorio-maestria--falta'}`}>
                                                    <p style={{ margin: 0, fontSize: '0.85em', fontWeight: 'bold' }}>
                                                        🎓 Maestria: {maestriaAtual}% / {req}% requerida
                                                        {suficiente ? ' — dominada, sem Fadiga extra.' : ' — abaixo do requisito, gera Fadiga extra ao usar.'}
                                                    </p>
                                                </div>
                                            );
                                        })()
                                    )}

                                    <button
                                        type="button"
                                        className={`btn-neon grimorio-btn grimorio-btn--disparo${overchargeAtivo ? ' btn-red' : ''}`}
                                        onClick={() => dispararAtaque(p)}
                                    >
                                        {overchargeAtivo ? '💥 DISPARAR OVERCHARGE FATAL!' : '⚔️ EXECUTAR HABILIDADE'}
                                    </button>
                                </div>
                            )}

                            {/* O editor de formas também mora no Grimório e herda os tokens do tema. */}
                            <FormasEditor
                                formas={p.formas || []}
                                formaAtivaId={p.formaAtivaId || null}
                                configAtivaId={p.configAtivaId || null}
                                onSalvarForma={(forma) => salvarFormaPoder(p.id, forma)}
                                onDeletarForma={(formaId) => deletarFormaPoder(p.id, formaId)}
                                onAtivarForma={(formaId, configId) => ativarFormaPoder(p.id, formaId, configId)}
                            />
                        </div>
            );
    };

    // 🗂️ A aba "🎭 Formas" SEMPRE agrupa por pasta (comportamento original, preservado — quem
    // nunca usou pasta nas Formas continua vendo o bucket único "📁 Sem Pasta"). Habilidades e
    // Poderes, que só ganharam Pasta agora, só entram em modo agrupado se ALGUM item da aba já
    // tiver uma pasta atribuída — senão continuam em lista simples, sem um "📁 Sem Pasta" boiando
    // sozinho pra quem nunca usou pastas nessas duas categorias.
    // 🗂️ Pastas aninhadas (core/pastas.js): "Taijutsu/Portões" é a pasta Portões dentro de Taijutsu.
    let arvore = null;
    if (abaAtual === 'forma' || itensFiltrados.some(p => p && segmentosPasta(p.pasta).length > 0)) {
        arvore = construirArvorePastas(itensFiltrados);
    }

    const renderPasta = (no, nivel) => {
        const aberta = !!pastasAbertas[chavePastaAberta(abaAtual, no.caminho)];
        const ehSemPasta = no.caminho === SEM_PASTA && nivel === 0 && no.semPastaVirtual;
        return (
            <div key={no.caminho} className={nivel > 0 ? 'pasta-no pasta-no--sub' : 'pasta-no'}>
                <div className="grimorio-pasta-cab">
                    <button type="button" className="grimorio-pasta-toggle" aria-expanded={aberta} onClick={() => alternarAberta(no.caminho)}>
                        <span aria-hidden="true">{aberta ? '▼' : '▶'}</span> 📁 {no.nome} <span className="grimorio-pasta-total">({no.total})</span>
                    </button>
                    {!ehSemPasta && (
                        <button type="button" className="grimorio-pasta-renomear" onClick={() => renomearOuRemoverPasta(no.caminho)} title="Renomear, mover (use /) ou remover esta pasta">
                            ✎ Renomear/Remover
                        </button>
                    )}
                </div>
                {aberta && (
                    <>
                        {no.itens.map(p => renderItem(p))}
                        {no.filhos.map(f => renderPasta(f, nivel + 1))}
                    </>
                )}
            </div>
        );
    };

    // Todas as pastas da árvore (e o balde "Sem Pasta"): alimenta "Expandir tudo" / "Recolher tudo".
    const chavesTodasPastas = [];
    if (arvore) {
        const coletar = (no) => { chavesTodasPastas.push(chavePastaAberta(abaAtual, no.caminho)); no.filhos.forEach(coletar); };
        arvore.pastas.forEach(coletar);
        if (arvore.semPasta.length > 0) chavesTodasPastas.push(chavePastaAberta(abaAtual, SEM_PASTA));
    }

    return (
        <div className="grimorio-lista">
            {itensFiltrados.length === 0 ? (
                <p className="grimorio-vazio">Nenhum registo deste tipo na sua alma.</p>
            ) : arvore ? (
                <>
                    <div className="grimorio-pastas-acoes">
                        <button type="button" className="btn-neon grimorio-btn-mini" onClick={() => definirPastasAbertas(chavesTodasPastas, true)}>📂 Expandir tudo</button>
                        <button type="button" className="btn-neon grimorio-btn-mini" onClick={() => definirPastasAbertas(chavesTodasPastas, false)}>📁 Recolher tudo</button>
                    </div>
                    {arvore.pastas.map(no => renderPasta(no, 0))}
                    {arvore.semPasta.length > 0 && renderPasta({ nome: SEM_PASTA, caminho: SEM_PASTA, itens: arvore.semPasta, filhos: [], total: arvore.semPasta.length, semPastaVirtual: true }, 0)}
                </>
            ) : (
                itensFiltrados.map(p => renderItem(p))
            )}
        </div>
    );
}

export function PoderesAuditoria() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const { relatorioAuditoria } = ctx;

    return (
        <div className="grimorio-auditoria">
            <h3 className="grimorio-auditoria-titulo">🔍 Auditoria de Combos Globais (Automático)</h3>
            <div style={{ fontSize: '0.9em', opacity: 0.9 }}>
                {relatorioAuditoria || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>Nenhum efeito passivo ativo computado.</span>}
            </div>
        </div>
    );
}

export function PoderesAreaCentral() {
    const ctx = usePoderesForm();
    const uid = useId();
    const idBase = `poderes-cat-${uid}`;
    const abaAtual = ctx ? ctx.abaAtual : 'habilidade';
    return (
        <div style={{ width: '100%' }}>
            <PoderesNavegacaoLivro idBase={idBase} />
            <div id={`${idBase}-painel`} role="tabpanel" aria-labelledby={`${idBase}-aba-${abaAtual}`}>
                <EnsinamentosRecebidos tipo="poder" />
                <PoderesImportadorIA />
                <ModelosPoderAssistente />
                <PoderesFormEditor />
                <PoderesLista />
                <PoderesAuditoria />
            </div>
        </div>
    );
}