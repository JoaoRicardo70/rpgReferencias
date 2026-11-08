import React, { useState, useCallback } from 'react';
import { normalizarGatilhos, descreverGatilho, descreverAcaoGatilho, EVENTOS_GATILHO, LIMITE_GATILHOS_POR_FONTE, LIMITE_ACOES_POR_GATILHO } from '../../core/gatilhos';
import { TIPOS_ESCUDO } from '../../core/escudos';

// 🔔 Editor de Gatilhos de um Poder (core/gatilhos.js, Fase 1: só modo automático).
// Recebe a lista atual e devolve a lista nova por onChange; a lista é validada por normalizarGatilhos ao salvar o Poder.

const ACOES_DO_FORMULARIO = [
    { id: 'anularDano', rotulo: 'Anular o dano' },
    { id: 'definirVida', rotulo: 'Ficar com N de vida' },
    { id: 'curar', rotulo: 'Curar % da Vida máxima' },
    { id: 'escudo', rotulo: 'Ganhar escudo' },
    { id: 'limparCondicoes', rotulo: 'Limpar condições' },
    { id: 'imunidadeTotal', rotulo: 'Imunidade total por N turnos' },
    { id: 'mensagem', rotulo: 'Mensagem no feed' },
];

const FORMULARIO_VAZIO = { id: '', nome: '', evento: 'danoQueZeraria', de: '10', ate: '1', vidaMaiorQue: '', limite: '', acoes: [], mestreDesligou: false };
const ACAO_VAZIA = { tipo: 'anularDano', valor: '', nome: '', tipoEscudo: 'escudo', texto: '' };

function formularioDe(g) {
    return {
        id: g.id, nome: g.nome, evento: g.evento.tipo, de: String(g.evento.de ?? '10'), ate: String(g.evento.ate ?? '1'),
        vidaMaiorQue: ((g.condicoes || []).find(c => c.startsWith('vida_maior_que:')) || '').split(':')[1] || '',
        limite: g.limite ? `${g.limite.max}:${g.limite.por}` : '',
        acoes: g.acoes, mestreDesligou: g.mestreDesligou === true,
        // O gatilho original segue junto: notas, prioridade, passivo, modo e armado não são editados aqui e não podem se perder.
        original: g,
        // Condições que o formulário não edita seguem junto.
        outrasCondicoes: (g.condicoes || []).filter(c => !c.startsWith('vida_maior_que:')),
    };
}

function gatilhoDe(f) {
    const [max, por] = f.limite ? f.limite.split(':') : [null, null];
    const condicoes = [...(f.outrasCondicoes || [])];
    if (String(f.vidaMaiorQue).trim() !== '') condicoes.push(`vida_maior_que:${String(f.vidaMaiorQue).trim()}`);
    const base = { ...(f.original || {}) };
    delete base.limite; delete base.mestreDesligou;
    return {
        modo: 'automatico', ...base,
        id: f.id || `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, nome: f.nome.trim() || 'Gatilho',
        evento: f.evento === 'vidaAbaixoDe' ? { tipo: 'vidaAbaixoDe', de: f.de, ate: f.ate } : { tipo: 'danoQueZeraria' },
        condicoes, acoes: f.acoes,
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
        default: return { tipo: a.tipo };
    }
}

export default function GatilhosEditor({ gatilhos, onChange, descartados = [] }) {
    const lista = Array.isArray(gatilhos) ? gatilhos : [];
    const [form, setForm] = useState(null);
    const [acao, setAcao] = useState(ACAO_VAZIA);
    const [erro, setErro] = useState('');

    const abrir = useCallback((g) => { setForm(g ? formularioDe(g) : { ...FORMULARIO_VAZIO }); setAcao(ACAO_VAZIA); setErro(''); }, []);

    const adicionarAcao = () => {
        const nova = normalizarGatilhos([{ nome: 'x', evento: { tipo: 'danoQueZeraria' }, acoes: [acaoDe(acao)] }]);
        if (nova.gatilhos.length === 0) { setErro('Ação incompleta: confira os valores.'); return; }
        if (form.acoes.length >= LIMITE_ACOES_POR_GATILHO) { setErro(`No máximo ${LIMITE_ACOES_POR_GATILHO} ações por gatilho.`); return; }
        setForm({ ...form, acoes: [...form.acoes, nova.gatilhos[0].acoes[0]] });
        setAcao(ACAO_VAZIA); setErro('');
    };

    const salvar = () => {
        if (form.acoes.length === 0) { setErro('Adicione pelo menos uma ação.'); return; }
        const r = normalizarGatilhos([gatilhoDe(form)]);
        if (r.gatilhos.length === 0) { setErro(`Gatilho inválido (${r.descartados[0] ? r.descartados[0].motivo : 'confira os campos'}).`); return; }
        const novo = r.gatilhos[0];
        const existe = lista.some(g => g.id === novo.id);
        if (!existe && lista.length >= LIMITE_GATILHOS_POR_FONTE) { setErro(`No máximo ${LIMITE_GATILHOS_POR_FONTE} gatilhos por Poder.`); return; }
        onChange(existe ? lista.map(g => (g.id === novo.id ? novo : g)) : [...lista, novo]);
        setForm(null); setErro('');
    };

    const remover = (id) => onChange(lista.filter(g => g.id !== id));

    return (
        <div className="gatilhos-editor">
            <div className="gatilhos-editor-titulo">🔔 Gatilhos</div>
            {descartados.length > 0 && <div className="gatilho-erro" role="status">Ao abrir este Poder, {descartados.length} gatilho(s) inválido(s) foram ignorados e serão removidos ao salvar: {descartados.map(d => `${d.nome} (${d.motivo})`).join('; ')}.</div>}
            {lista.length === 0 && !form && <div className="gatilhos-editor-vazio">Nenhum gatilho. Gatilhos agem sozinhos quando o evento acontece (ex.: segurar a morte).</div>}
            {lista.map(g => (
                <div key={g.id} className="gatilho-item">
                    <span className="gatilho-item-texto"><strong>{g.nome}</strong> — {descreverGatilho(g)}</span>
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
                    {form.evento === 'vidaAbaixoDe' && <div className="gatilho-dica">A faixa usa o % arredondado para baixo: Vida entre 0 e 1% (ainda viva) não cai numa faixa "5–1". Para o caso 0%, use "Quando um golpe me levaria a 0 de vida".</div>}
                    {form.evento === 'danoQueZeraria' && <div className="gatilho-dica">"Ficar com N de vida" já anula o golpe. "Curar" cura antes do dano e, se ainda assim a Vida zerar, não salva.</div>}
                    <label className="gatilho-condicao">Só se a Vida for maior que <input type="number" min="0" aria-label="Só se a Vida for maior que" placeholder="(sem condição)" value={form.vidaMaiorQue} onChange={e => setForm({ ...form, vidaMaiorQue: e.target.value })} /></label>
                    <select aria-label="Limite de usos do gatilho" value={form.limite} onChange={e => setForm({ ...form, limite: e.target.value })}>
                        <option value="">Sem limite</option>
                        <option value="1:cena">1 vez por cena</option>
                        <option value="1:descanso">1 vez por descanso</option>
                        {form.limite && !['1:cena', '1:descanso'].includes(form.limite) && <option value={form.limite}>{`${form.limite.split(':')[0]} vezes ${form.limite.split(':')[1] === 'cena' ? 'por cena' : 'por descanso'}`}</option>}
                    </select>
                    <div className="gatilho-acoes-lista">
                        {form.acoes.map((a, i) => (
                            <div key={i} className="gatilho-acao-item">
                                <span>{i + 1}. {descreverAcaoGatilho(a)}</span>
                                <button type="button" className="btn-neon" aria-label={`Remover ação ${i + 1}`} onClick={() => setForm({ ...form, acoes: form.acoes.filter((_, j) => j !== i) })}>✖</button>
                            </div>
                        ))}
                    </div>
                    <div className="gatilho-acao-form">
                        <select aria-label="Tipo da ação" value={acao.tipo} onChange={e => setAcao({ ...ACAO_VAZIA, tipo: e.target.value })}>
                            {ACOES_DO_FORMULARIO.filter(a => a.id !== 'anularDano' || form.evento === 'danoQueZeraria').map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                        </select>
                        {['definirVida', 'curar', 'escudo', 'imunidadeTotal'].includes(acao.tipo) && (
                            <input type="number" min="0" aria-label="Valor da ação" placeholder={acao.tipo === 'curar' ? '% da Vida' : acao.tipo === 'imunidadeTotal' ? 'turnos' : 'valor'} value={acao.valor} onChange={e => setAcao({ ...acao, valor: e.target.value })} />
                        )}
                        {acao.tipo === 'escudo' && (
                            <>
                                <input type="text" maxLength={40} aria-label="Nome do escudo" placeholder="Nome do escudo" value={acao.nome} onChange={e => setAcao({ ...acao, nome: e.target.value })} />
                                <select aria-label="Tipo do escudo" value={acao.tipoEscudo} onChange={e => setAcao({ ...acao, tipoEscudo: e.target.value })}>{TIPOS_ESCUDO.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select>
                            </>
                        )}
                        {acao.tipo === 'mensagem' && <input type="text" maxLength={300} aria-label="Texto da mensagem" placeholder="Texto" value={acao.texto} onChange={e => setAcao({ ...acao, texto: e.target.value })} />}
                        <button type="button" className="btn-neon" onClick={adicionarAcao}>+ Ação</button>
                    </div>
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
