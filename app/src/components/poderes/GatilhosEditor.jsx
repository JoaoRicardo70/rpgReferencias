import React, { useState, useCallback } from 'react';
import { normalizarGatilhos, normalizarAcaoGatilho, descreverGatilho, descreverAcaoGatilho, EVENTOS_GATILHO, NIVEIS_ACERTO, LIMITE_GATILHOS_POR_FONTE, LIMITE_ACOES_POR_GATILHO, LIMITE_LINHAS_TABELA } from '../../core/gatilhos';
import { ESTADOS } from '../../core/condicoes';
import { TIPOS_ESCUDO } from '../../core/escudos';

// 🔔 Editor de Gatilhos de um Poder (core/gatilhos.js, Fases 1 a 3: automático ou opcional, tabela de dado e dano no atacante).
// `contadores` e `poderes` (da ficha) alimentam as listas de contador e de Poder; sem eles os campos ficam sem opções.
// Recebe a lista atual e devolve a lista nova por onChange; a lista é validada por normalizarGatilhos ao salvar o Poder.

const ACOES_DO_FORMULARIO = [
    { id: 'anularDano', rotulo: 'Anular o dano' },
    { id: 'definirVida', rotulo: 'Ficar com N de vida' },
    { id: 'curar', rotulo: 'Curar % da Vida máxima' },
    { id: 'escudo', rotulo: 'Ganhar escudo' },
    { id: 'limparCondicoes', rotulo: 'Limpar condições' },
    { id: 'imunidadeTotal', rotulo: 'Imunidade total por N turnos' },
    { id: 'mensagem', rotulo: 'Mensagem no feed' },
    { id: 'contador', rotulo: 'Mexer num contador' },
    { id: 'aplicarEstado', rotulo: 'Aplicar um estado em mim' },
    { id: 'removerEstado', rotulo: 'Remover um estado' },
    { id: 'ligarPoder', rotulo: 'Ligar um Poder' },
    { id: 'desligarPoder', rotulo: 'Desligar um Poder' },
    { id: 'danoEmSi', rotulo: 'Sofrer dano' },
    { id: 'danoNoAtacante', rotulo: 'Dano no atacante' },
    { id: 'rolarTabela', rotulo: 'Rolar tabela' },
];
const ROTULO_NIVEL = { qualquer: 'qualquer golpe', normal: 'golpe normal', critico: 'golpe crítico', fatal: 'golpe crítico fatal' };
const OPS_CONTADOR = [{ id: 'somar', rotulo: 'somar' }, { id: 'definir', rotulo: 'definir para' }, { id: 'zerar', rotulo: 'zerar' }, { id: 'dividir', rotulo: 'dividir por' }];
const EXPLICACAO_MODO = {
    automatico: 'Automático: sempre vale quando o evento acontece (só o Mestre pode desligar).',
    opcional: 'Opcional: só vale armado. O dono e o Mestre armam e desarmam no cartão do Poder; armado conta como "sim" antecipado, mesmo com o dono fora.',
};

const FORMULARIO_VAZIO = { id: '', nome: '', evento: 'danoQueZeraria', de: '10', ate: '1', nivel: 'qualquer', poderEvento: '', contadorEvento: '', opEvento: '>=', valorEvento: '', vidaMaiorQue: '', limite: '', acoes: [], mestreDesligou: false, modo: 'automatico', armado: true, perguntar: false };
const ACAO_VAZIA = { tipo: 'anularDano', valor: '', nome: '', tipoEscudo: 'escudo', texto: '', contadorId: '', op: 'somar', sorteio: '', estado: 'queimado', poderId: '', modoDano: 'fixo', modoAtacante: 'percDanoRecebido' };
const TABELA_VAZIA = { dado: '1d4', linhas: [{ ate: '1', texto: '', acoes: [] }], alvo: 0 };

function formularioDe(g) {
    return {
        id: g.id, nome: g.nome, evento: g.evento.tipo, de: String(g.evento.de ?? '10'), ate: String(g.evento.ate ?? '1'),
        nivel: g.evento.nivel || 'qualquer', poderEvento: g.evento.poderId || '', contadorEvento: g.evento.contadorId || '', opEvento: g.evento.op || '>=', valorEvento: g.evento.valor !== undefined ? String(g.evento.valor) : '',
        vidaMaiorQue: ((g.condicoes || []).find(c => c.startsWith('vida_maior_que:')) || '').split(':')[1] || '',
        limite: g.limite ? `${g.limite.max}:${g.limite.por}` : '',
        acoes: g.acoes, mestreDesligou: g.mestreDesligou === true,
        modo: g.modo === 'opcional' ? 'opcional' : 'automatico', armado: g.armado === true, perguntar: g.perguntar === true,
        // O gatilho original segue junto: notas, prioridade e passivo não são editados aqui e não podem se perder.
        original: g,
        // Condições que o formulário não edita seguem junto.
        outrasCondicoes: (g.condicoes || []).filter(c => !c.startsWith('vida_maior_que:')),
    };
}

function eventoDe(f) {
    switch (f.evento) {
        case 'vidaAbaixoDe': return { tipo: 'vidaAbaixoDe', de: f.de, ate: f.ate };
        case 'acertou': case 'atingido': return { tipo: f.evento, nivel: f.nivel };
        case 'poderLigou': case 'poderDesligou': return { tipo: f.evento, poderId: f.poderEvento };
        case 'contadorAtingiu': return { tipo: 'contadorAtingiu', contadorId: f.contadorEvento, op: f.opEvento, valor: f.valorEvento };
        default: return { tipo: f.evento };
    }
}

function gatilhoDe(f) {
    const [max, por] = f.limite ? f.limite.split(':') : [null, null];
    const condicoes = [...(f.outrasCondicoes || [])];
    if (String(f.vidaMaiorQue).trim() !== '') condicoes.push(`vida_maior_que:${String(f.vidaMaiorQue).trim()}`);
    const base = { ...(f.original || {}) };
    delete base.limite; delete base.mestreDesligou; delete base.modo; delete base.armado; delete base.perguntar;
    const opcional = f.modo === 'opcional';
    return {
        ...base,
        id: f.id || `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, nome: f.nome.trim() || 'Gatilho',
        evento: eventoDe(f),
        condicoes, acoes: f.acoes,
        modo: opcional ? 'opcional' : 'automatico',
        ...(opcional ? { armado: f.armado === true, ...(f.perguntar ? { perguntar: true } : {}) } : {}),
        ...(max ? { limite: { max, por } } : {}),
        ...(f.mestreDesligou ? { mestreDesligou: true } : {}),
    };
}

function acaoDe(a) {
    switch (a.tipo) {
        case 'definirVida': return { tipo: 'definirVida', valor: a.valor };
        case 'curar': return { tipo: 'curar', modo: 'percMax', valor: a.valor };
        case 'escudo': return { tipo: 'escudo', nome: a.nome, valor: a.valor, tipoEscudo: a.tipoEscudo };
        case 'imunidadeTotal': return { tipo: 'imunidadeTotal', duracaoTurnos: a.valor || 1 };
        case 'mensagem': return { tipo: 'mensagem', texto: a.texto };
        case 'contador': return { tipo: 'contador', id: a.contadorId, op: a.op, valor: a.valor, sorteio: a.sorteio };
        case 'aplicarEstado': return { tipo: 'aplicarEstado', estado: a.estado, stacks: a.valor || 1 };
        case 'removerEstado': return { tipo: 'removerEstado', estado: a.estado };
        case 'ligarPoder': case 'desligarPoder': return { tipo: a.tipo, poderId: a.poderId };
        case 'danoEmSi': return { tipo: 'danoEmSi', modo: a.modoDano, valor: a.valor };
        case 'danoNoAtacante': return { tipo: 'danoNoAtacante', modo: a.modoAtacante, valor: a.valor };
        default: return { tipo: a.tipo };
    }
}

// Campos de UMA ação (o mesmo formulário serve ao gatilho e às linhas de uma tabela de dado). `permitirTabela`: false dentro de uma linha da tabela.
function CamposDaAcao({ acao, setAcao, anularDanoOk, permitirTabela, nomes, onAdicionar, rotuloBotao, sufixo = '' }) {
    return (
        <div className="gatilho-acao-form">
            <select aria-label={`Tipo da ação${sufixo}`} value={acao.tipo} onChange={e => setAcao({ ...ACAO_VAZIA, tipo: e.target.value })}>
                {ACOES_DO_FORMULARIO.filter(a => (a.id !== 'anularDano' || anularDanoOk) && (a.id !== 'rolarTabela' || permitirTabela)).map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
            </select>
            {['definirVida', 'curar', 'escudo', 'imunidadeTotal', 'danoEmSi', 'danoNoAtacante', 'aplicarEstado'].includes(acao.tipo) && (
                <input type="number" min="0" aria-label={`Valor da ação${sufixo}`} placeholder={acao.tipo === 'curar' ? '% da Vida' : acao.tipo === 'imunidadeTotal' ? 'turnos' : acao.tipo === 'aplicarEstado' ? 'stacks' : acao.tipo === 'danoNoAtacante' && acao.modoAtacante === 'percDanoRecebido' ? '% do dano recebido (antes do escudo)' : 'valor'} value={acao.valor} onChange={e => setAcao({ ...acao, valor: e.target.value })} />
            )}
            {acao.tipo === 'escudo' && (
                <>
                    <input type="text" maxLength={40} aria-label={`Nome do escudo${sufixo}`} placeholder="Nome do escudo" value={acao.nome} onChange={e => setAcao({ ...acao, nome: e.target.value })} />
                    <select aria-label={`Tipo do escudo${sufixo}`} value={acao.tipoEscudo} onChange={e => setAcao({ ...acao, tipoEscudo: e.target.value })}>{TIPOS_ESCUDO.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select>
                </>
            )}
            {acao.tipo === 'danoEmSi' && (
                <select aria-label={`Tipo do dano em si${sufixo}`} value={acao.modoDano} onChange={e => setAcao({ ...acao, modoDano: e.target.value })}>
                    <option value="fixo">pontos fixos</option>
                    <option value="percMax">% da Vida máxima</option>
                    <option value="percAtual">% da Vida atual</option>
                </select>
            )}
            {acao.tipo === 'danoNoAtacante' && (
                <select aria-label={`Tipo do dano no atacante${sufixo}`} value={acao.modoAtacante} onChange={e => setAcao({ ...acao, modoAtacante: e.target.value })}>
                    <option value="percDanoRecebido">% do dano recebido (antes do escudo)</option>
                    <option value="fixo">pontos fixos</option>
                </select>
            )}
            {acao.tipo === 'contador' && (
                <>
                    <select aria-label={`Contador da ação${sufixo}`} value={acao.contadorId} onChange={e => setAcao({ ...acao, contadorId: e.target.value })}>
                        <option value="">(escolha o contador)</option>
                        {nomes.contadores.map(c => <option key={String(c.id)} value={String(c.id)}>{c.nome}</option>)}
                    </select>
                    <select aria-label={`Operação no contador${sufixo}`} value={acao.op} onChange={e => setAcao({ ...acao, op: e.target.value })}>
                        {OPS_CONTADOR.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                    </select>
                    {acao.op !== 'zerar' && <input type="number" aria-label={`Valor para o contador${sufixo}`} placeholder="valor (negativo diminui)" value={acao.valor} onChange={e => setAcao({ ...acao, valor: e.target.value })} />}
                    {(acao.op === 'somar' || acao.op === 'definir') && <input type="text" maxLength={8} aria-label={`Sorteio de dados (opcional)${sufixo}`} placeholder="sorteio ex.: 1d3" value={acao.sorteio} onChange={e => setAcao({ ...acao, sorteio: e.target.value })} />}
                </>
            )}
            {(acao.tipo === 'aplicarEstado' || acao.tipo === 'removerEstado') && (
                <select aria-label={`Estado${sufixo}`} value={acao.estado} onChange={e => setAcao({ ...acao, estado: e.target.value })}>
                    {ESTADOS.map(est => <option key={est.id} value={est.id}>{est.icone} {est.nome}</option>)}
                </select>
            )}
            {(acao.tipo === 'ligarPoder' || acao.tipo === 'desligarPoder') && (
                <select aria-label={`Poder da ação${sufixo}`} value={acao.poderId} onChange={e => setAcao({ ...acao, poderId: e.target.value })}>
                    <option value="">(escolha o Poder)</option>
                    {nomes.poderes.map(p => <option key={String(p.id)} value={String(p.id)}>{p.nome}</option>)}
                </select>
            )}
            {acao.tipo === 'mensagem' && <input type="text" maxLength={300} aria-label={`Texto da mensagem${sufixo}`} placeholder="Texto" value={acao.texto} onChange={e => setAcao({ ...acao, texto: e.target.value })} />}
            {acao.tipo !== 'rolarTabela' && <button type="button" className="btn-neon" onClick={onAdicionar}>{rotuloBotao}</button>}
        </div>
    );
}

export default function GatilhosEditor({ gatilhos, onChange, descartados = [], contadores = [], poderes = [] }) {
    const nomes = { contadores: Array.isArray(contadores) ? contadores : [], poderes: Array.isArray(poderes) ? poderes : [] };
    const lista = Array.isArray(gatilhos) ? gatilhos : [];
    const [form, setForm] = useState(null);
    const [acao, setAcao] = useState(ACAO_VAZIA);
    const [tabela, setTabela] = useState(TABELA_VAZIA);
    const [acaoLinha, setAcaoLinha] = useState(ACAO_VAZIA);
    const [erro, setErro] = useState('');

    const abrir = useCallback((g) => { setForm(g ? formularioDe(g) : { ...FORMULARIO_VAZIO }); setAcao(ACAO_VAZIA); setTabela(TABELA_VAZIA); setAcaoLinha(ACAO_VAZIA); setErro(''); }, []);

    const adicionarAcao = () => {
        const nova = normalizarGatilhos([{ nome: 'x', evento: { tipo: 'danoQueZeraria' }, acoes: [acaoDe(acao)] }]);
        if (nova.gatilhos.length === 0) { setErro('Ação incompleta: confira os valores.'); return; }
        if (form.acoes.length >= LIMITE_ACOES_POR_GATILHO) { setErro(`No máximo ${LIMITE_ACOES_POR_GATILHO} ações por gatilho.`); return; }
        setForm({ ...form, acoes: [...form.acoes, nova.gatilhos[0].acoes[0]] });
        setAcao(ACAO_VAZIA); setErro('');
    };

    // ---- Tabela de dado (ação "Rolar tabela"): rascunho próprio; só entra no gatilho ao clicar em "Adicionar tabela".
    const tabelaBruta = () => ({ tipo: 'rolarTabela', dado: tabela.dado, resultados: tabela.linhas.map(l => ({ ate: l.ate, texto: l.texto, acoes: l.acoes })) });
    const tabelaNormalizada = () => normalizarAcaoGatilho(tabelaBruta(), { eventoTipo: form ? form.evento : 'danoQueZeraria' });
    const mudarLinha = (i, parte) => setTabela({ ...tabela, linhas: tabela.linhas.map((l, j) => (j === i ? { ...l, ...parte } : l)) });
    const novaLinha = () => {
        if (tabela.linhas.length >= LIMITE_LINHAS_TABELA) { setErro(`No máximo ${LIMITE_LINHAS_TABELA} linhas na tabela.`); return; }
        const ultimo = Number(tabela.linhas[tabela.linhas.length - 1]?.ate);
        setTabela({ ...tabela, linhas: [...tabela.linhas, { ate: Number.isFinite(ultimo) ? String(ultimo + 1) : '', texto: '', acoes: [] }], alvo: tabela.linhas.length });
        setErro('');
    };
    const removerLinha = (i) => setTabela({ ...tabela, linhas: tabela.linhas.filter((_, j) => j !== i), alvo: 0 });
    const adicionarAcaoNaLinha = () => {
        const nova = normalizarAcaoGatilho(acaoDe(acaoLinha), { eventoTipo: form.evento, dentroDeTabela: true });
        if (!nova) { setErro('Ação da linha incompleta: confira os valores.'); return; }
        const linha = tabela.linhas[tabela.alvo];
        if (!linha) { setErro('Escolha a linha que recebe a ação.'); return; }
        if (linha.acoes.length >= LIMITE_ACOES_POR_GATILHO) { setErro(`No máximo ${LIMITE_ACOES_POR_GATILHO} ações por linha.`); return; }
        mudarLinha(tabela.alvo, { acoes: [...linha.acoes, nova] });
        setAcaoLinha(ACAO_VAZIA); setErro('');
    };
    const adicionarTabela = () => {
        const nova = tabelaNormalizada();
        if (!nova) { setErro('Tabela inválida: use um dado NdM (ex.: 1d4), "até" crescente e pelo menos uma ação em cada linha.'); return; }
        if (form.acoes.length >= LIMITE_ACOES_POR_GATILHO) { setErro(`No máximo ${LIMITE_ACOES_POR_GATILHO} ações por gatilho.`); return; }
        if (form.acoes.some(a => a.tipo === 'rolarTabela')) { setErro('Só uma tabela por gatilho.'); return; }
        setForm({ ...form, acoes: [...form.acoes, nova] });
        setAcao(ACAO_VAZIA); setTabela(TABELA_VAZIA); setAcaoLinha(ACAO_VAZIA); setErro('');
    };

    const salvar = () => {
        if (form.acoes.length === 0) { setErro('Adicione pelo menos uma ação.'); return; }
        if (form.evento === 'contadorAtingiu' && !form.contadorEvento) { setErro('Escolha o contador.'); return; }
        const r = normalizarGatilhos([gatilhoDe(form)]);
        if (r.gatilhos.length === 0) { setErro(`Gatilho inválido (${r.descartados[0] ? r.descartados[0].motivo : 'confira os campos'}).`); return; }
        const novo = r.gatilhos[0];
        const existe = lista.some(g => g.id === novo.id);
        if (!existe && lista.length >= LIMITE_GATILHOS_POR_FONTE) { setErro(`No máximo ${LIMITE_GATILHOS_POR_FONTE} gatilhos por Poder.`); return; }
        onChange(existe ? lista.map(g => (g.id === novo.id ? novo : g)) : [...lista, novo]);
        setForm(null); setErro('');
    };

    const remover = (id) => onChange(lista.filter(g => g.id !== id));

    // Pré-visualização em frase do gatilho que está sendo montado (vazia enquanto incompleto).
    const previa = () => {
        if (!form || form.acoes.length === 0) return '';
        const r = normalizarGatilhos([gatilhoDe(form)], { persistir: false });
        return r.gatilhos[0] ? descreverGatilho(r.gatilhos[0], nomes) : '';
    };

    return (
        <div className="gatilhos-editor">
            <div className="gatilhos-editor-titulo">🔔 Gatilhos</div>
            {descartados.length > 0 && <div className="gatilho-erro" role="status">Ao abrir este Poder, {descartados.length} gatilho(s) inválido(s) foram ignorados e serão removidos ao salvar: {descartados.map(d => `${d.nome} (${d.motivo})`).join('; ')}.</div>}
            {lista.length === 0 && !form && <div className="gatilhos-editor-vazio">Nenhum gatilho. Gatilhos agem sozinhos quando o evento acontece (ex.: segurar a morte).</div>}
            {lista.map(g => (
                <div key={g.id} className="gatilho-item">
                    <span className="gatilho-item-texto"><strong>{g.nome}</strong> — {descreverGatilho(g, nomes)}</span>
                    <button type="button" className="btn-neon" onClick={() => abrir(g)} aria-label={`Editar gatilho ${g.nome}`}>✏️</button>
                    <button type="button" className="btn-neon" onClick={() => remover(g.id)} aria-label={`Remover gatilho ${g.nome}`}>🗑️</button>
                </div>
            ))}
            {form ? (
                <div className="gatilho-form">
                    <input type="text" maxLength={60} placeholder="Nome (ex.: Negar morte)" aria-label="Nome do gatilho" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                    <select aria-label="Evento do gatilho" value={form.evento} onChange={e => setForm({ ...form, evento: e.target.value, acoes: e.target.value === 'danoQueZeraria' ? form.acoes : form.acoes.filter(a => a.tipo !== 'anularDano') })}>
                        {EVENTOS_GATILHO.map(ev => <option key={ev.id} value={ev.id}>{ev.rotulo}</option>)}
                    </select>
                    {form.evento === 'vidaAbaixoDe' && (
                        <span className="gatilho-faixa">
                            de <input type="number" min="0" max="100" aria-label="Faixa de Vida: de (%)" value={form.de} onChange={e => setForm({ ...form, de: e.target.value })} />%
                            até <input type="number" min="0" max="100" aria-label="Faixa de Vida: até (%)" value={form.ate} onChange={e => setForm({ ...form, ate: e.target.value })} />% da Vida máxima
                        </span>
                    )}
                    {(form.evento === 'acertou' || form.evento === 'atingido') && (
                        <select aria-label="Nível do golpe" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })}>
                            {NIVEIS_ACERTO.map(n => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
                        </select>
                    )}
                    {(form.evento === 'poderLigou' || form.evento === 'poderDesligou') && (
                        <select aria-label="Qual Poder" value={form.poderEvento} onChange={e => setForm({ ...form, poderEvento: e.target.value })}>
                            <option value="">Este Poder</option>
                            <option value="qualquer">Qualquer Poder</option>
                            {nomes.poderes.map(p => <option key={String(p.id)} value={String(p.id)}>{p.nome}</option>)}
                        </select>
                    )}
                    {form.evento === 'contadorAtingiu' && (
                        <span className="gatilho-faixa">
                            <select aria-label="Contador do evento" value={form.contadorEvento} onChange={e => setForm({ ...form, contadorEvento: e.target.value })}>
                                <option value="">(escolha o contador)</option>
                                {nomes.contadores.map(c => <option key={String(c.id)} value={String(c.id)}>{c.nome}</option>)}
                            </select>
                            <select aria-label="Comparação do contador" value={form.opEvento} onChange={e => setForm({ ...form, opEvento: e.target.value })}>
                                <option value=">=">chegar a pelo menos</option>
                                <option value="==">chegar exatamente a</option>
                            </select>
                            <input type="number" aria-label="Valor do contador" value={form.valorEvento} onChange={e => setForm({ ...form, valorEvento: e.target.value })} />
                        </span>
                    )}
                    {form.evento === 'vidaAbaixoDe' && <div className="gatilho-dica">A faixa usa o % arredondado para baixo: Vida entre 0 e 1% (ainda viva) não cai numa faixa "5–1". Para o caso 0%, use "Quando um golpe me levaria a 0 de vida".</div>}
                    {form.evento === 'atingido' && <div className="gatilho-dica">Conta só quando o golpe tira Vida: se o escudo absorver tudo, ou com Imunidade total, não dispara.</div>}
                    {form.evento === 'contadorAtingiu' && <div className="gatilho-dica">Só dispara quando um gatilho muda o contador (não quando você o altera à mão na ficha) e só na hora em que ele passa a valer.</div>}
                    {form.evento === 'danoQueZeraria' && <div className="gatilho-dica">"Ficar com N de vida" já anula o golpe. "Curar" cura antes do dano e, se ainda assim a Vida zerar, não salva.</div>}
                    <label className="gatilho-condicao">Só se a Vida for maior que <input type="number" min="0" aria-label="Só se a Vida for maior que" placeholder="(sem condição)" value={form.vidaMaiorQue} onChange={e => setForm({ ...form, vidaMaiorQue: e.target.value })} /></label>
                    <select aria-label="Limite de usos do gatilho" value={form.limite} onChange={e => setForm({ ...form, limite: e.target.value })}>
                        <option value="">Sem limite</option>
                        <option value="1:turno">1 vez por turno</option>
                        <option value="1:cena">1 vez por cena</option>
                        <option value="1:descanso">1 vez por descanso</option>
                        {form.limite && !['1:turno', '1:cena', '1:descanso'].includes(form.limite) && <option value={form.limite}>{`${form.limite.split(':')[0]} vezes ${{ turno: 'por turno', cena: 'por cena', descanso: 'por descanso' }[form.limite.split(':')[1]] || ''}`}</option>}
                    </select>
                    <div className="gatilho-modo">
                        <select aria-label="Modo do gatilho" value={form.modo} onChange={e => setForm({ ...form, modo: e.target.value })}>
                            <option value="automatico">Automático (sempre vale)</option>
                            <option value="opcional">Opcional (você arma e desarma)</option>
                        </select>
                        {form.modo === 'opcional' && (
                            <>
                                <label><input type="checkbox" aria-label="Começa armado" checked={form.armado} onChange={e => setForm({ ...form, armado: e.target.checked })} /> começa armado</label>
                                <label><input type="checkbox" aria-label="Perguntar antes de usar" checked={form.perguntar} onChange={e => setForm({ ...form, perguntar: e.target.checked })} /> perguntar antes de usar</label>
                            </>
                        )}
                    </div>
                    <div className="gatilho-dica">{EXPLICACAO_MODO[form.modo]}{form.modo === 'opcional' && form.perguntar ? ' A pergunta vale só para dano na Vida aplicado no seu aparelho (quando o Mestre ou outro jogador aplica, ou com você fora, vale só "armado"). Em acertou, turno, ligar/desligar Poder o gatilho vale pelo "armado", sem pergunta; gatilhos disparados por outras linhas de uma tabela de dado também não são perguntados.' : ''}</div>
                    <div className="gatilho-acoes-lista">
                        {form.acoes.map((a, i) => (
                            <div key={i} className="gatilho-acao-item">
                                <span>{i + 1}. {descreverAcaoGatilho(a, nomes)}</span>
                                <button type="button" className="btn-neon" aria-label={`Remover ação ${i + 1}`} onClick={() => setForm({ ...form, acoes: form.acoes.filter((_, j) => j !== i) })}>✖</button>
                            </div>
                        ))}
                    </div>
                    <CamposDaAcao acao={acao} setAcao={setAcao} anularDanoOk={form.evento === 'danoQueZeraria'} permitirTabela nomes={nomes} onAdicionar={adicionarAcao} rotuloBotao="+ Ação" />
                    {acao.tipo === 'rolarTabela' && (
                        <div className="gatilho-tabela">
                            <label className="gatilho-condicao">Dado <input type="text" maxLength={8} aria-label="Dado da tabela" placeholder="1d4" value={tabela.dado} onChange={e => setTabela({ ...tabela, dado: e.target.value })} /></label>
                            {tabela.linhas.map((l, i) => (
                                <div key={i} className="gatilho-tabela-linha">
                                    <label><input type="radio" name="linha-alvo" aria-label={`Receber ações na linha ${i + 1}`} checked={tabela.alvo === i} onChange={() => setTabela({ ...tabela, alvo: i })} /> até</label>
                                    <input type="number" min="1" aria-label={`Até (linha ${i + 1})`} value={l.ate} onChange={e => mudarLinha(i, { ate: e.target.value })} />
                                    <input type="text" maxLength={120} aria-label={`Texto da linha ${i + 1}`} placeholder="texto (opcional)" value={l.texto} onChange={e => mudarLinha(i, { texto: e.target.value })} />
                                    <span>{l.acoes.length === 0 ? '(sem ações)' : l.acoes.map(a => descreverAcaoGatilho(a, nomes)).join(' + ')}</span>
                                    {l.acoes.length > 0 && <button type="button" className="btn-neon" aria-label={`Limpar ações da linha ${i + 1}`} onClick={() => mudarLinha(i, { acoes: [] })}>↺</button>}
                                    {tabela.linhas.length > 1 && <button type="button" className="btn-neon" aria-label={`Remover linha ${i + 1}`} onClick={() => removerLinha(i)}>✖</button>}
                                </div>
                            ))}
                            <button type="button" className="btn-neon" onClick={novaLinha}>+ Linha</button>
                            <div className="gatilho-dica">As ações abaixo entram na linha marcada (a linha vale do número seguinte ao da anterior até o seu "até").</div>
                            <CamposDaAcao acao={acaoLinha} setAcao={setAcaoLinha} anularDanoOk={form.evento === 'danoQueZeraria'} permitirTabela={false} nomes={nomes} onAdicionar={adicionarAcaoNaLinha} rotuloBotao="+ Ação na linha" sufixo=" (linha)" />
                            {tabelaNormalizada() && <div className="gatilho-dica">{descreverAcaoGatilho(tabelaNormalizada(), nomes)}</div>}
                            <button type="button" className="btn-neon" onClick={adicionarTabela}>Adicionar tabela</button>
                        </div>
                    )}
                    {previa() && <div className="gatilho-dica">Resumo: {previa()}</div>}
                    {erro && <div className="gatilho-erro" role="alert">{erro}</div>}
                    <div className="gatilho-form-botoes">
                        <button type="button" className="btn-neon" onClick={salvar}>Salvar gatilho</button>
                        <button type="button" className="btn-neon" onClick={() => { setForm(null); setErro(''); }}>Cancelar</button>
                    </div>
                </div>
            ) : (
                <button type="button" className="btn-neon" onClick={() => abrir(null)} disabled={lista.length >= LIMITE_GATILHOS_POR_FONTE}>+ Novo gatilho</button>
            )}
        </div>
    );
}
