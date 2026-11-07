import React from 'react';
import { OPCOES_QUANDO, OPCOES_ESCOPO, ATRIBUTOS_COM_QUANDO, ATRIBUTOS_COM_ESCOPO, ATRIBUTOS_COM_ESCOPO_ESTADO, ESCOPO_TODOS_OS_ESTADOS } from '../../core/efeitosCondicionais';
import { ESTADOS } from '../../core/condicoes';
import { SKILLS, SAVES } from '../combate/TestesFormContext';

const partir = (valor) => {
    const [base, ...resto] = String(valor || '').split(':');
    return { base, arg: resto.join(':'), temArg: resto.length > 0 };
};

// ❓ Condição ("quando") e escopo opcionais de um efeito (core/efeitosCondicionais.js). Os valores são os mesmos que o efeito guarda
// ('empunhando_arma:espada', 'alvo_com_estado:surpreso', 'teste:intuicao'); vazio = sem condição / padrão do efeito.
export default function CondicaoDoEfeito({ atributo, quando, onQuando, escopo, onEscopo }) {
    const q = partir(quando);
    const e = partir(escopo);
    const baseQuando = q.base || 'sempre';
    const baseEscopo = e.base || '';
    const comEscopo = ATRIBUTOS_COM_ESCOPO.includes(atributo);
    const comEscopoEstado = ATRIBUTOS_COM_ESCOPO_ESTADO.includes(atributo);
    // Só os atributos que leem a condição mostram o "Quando" (nos outros ela seria ignorada).
    if (!ATRIBUTOS_COM_QUANDO.includes(atributo)) return null;
    const idDoTeste = [...SKILLS, ...SAVES].find(t => t.id.toLowerCase() === e.arg.toLowerCase());

    const trocarQuando = (base) => {
        if (base === 'sempre') onQuando('');
        else if (base === 'em_combate' || base === 'empunhando_arma') onQuando(base);
        else onQuando(`${base}:`);
    };
    const trocarEscopo = (base) => onEscopo(base === 'teste:' ? 'teste:' : base);

    return (
        <div className="condicao-efeito">
            <label className="condicao-efeito-campo">
                <span>Quando</span>
                <select value={baseQuando} aria-label="Condição do efeito" onChange={ev => trocarQuando(ev.target.value)}>
                    {OPCOES_QUANDO.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
            </label>
            {baseQuando === 'alvo_com_estado' && (
                <select value={q.arg} aria-label="Estado do alvo" onChange={ev => onQuando(`alvo_com_estado:${ev.target.value}`)}>
                    <option value="">Estado…</option>
                    {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.icone} {s.nome}</option>)}
                </select>
            )}
            {baseQuando === 'alvo_vida_abaixo' && (
                <input type="number" min="1" max="100" placeholder="%" aria-label="Vida do alvo abaixo de (%)" value={q.arg} onChange={ev => onQuando(`alvo_vida_abaixo:${ev.target.value}`)} />
            )}
            {baseQuando === 'empunhando_arma' && (
                <input type="text" placeholder="tipo (opcional)" aria-label="Tipo de arma" value={q.arg} onChange={ev => onQuando(ev.target.value.trim() ? `empunhando_arma:${ev.target.value}` : 'empunhando_arma')} />
            )}
            {comEscopo && (
                <label className="condicao-efeito-campo">
                    <span>Vale em</span>
                    <select value={e.temArg ? 'teste:' : baseEscopo} aria-label="Escopo do efeito" onChange={ev => trocarEscopo(ev.target.value)}>
                        {OPCOES_ESCOPO.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                    </select>
                </label>
            )}
            {comEscopoEstado && (
                <label className="condicao-efeito-campo">
                    <span>Estado</span>
                    <select value={String(escopo || '')} aria-label="Estado do efeito" onChange={ev => onEscopo(ev.target.value)}>
                        <option value="">Escolha o estado…</option>
                        <option value={ESCOPO_TODOS_OS_ESTADOS}>Todos os estados</option>
                        {ESTADOS.map(st => <option key={st.id} value={st.id}>{st.icone} {st.nome}</option>)}
                    </select>
                </label>
            )}
            {comEscopo && e.temArg && (
                <select value={idDoTeste ? idDoTeste.id : ''} aria-label="Teste do escopo" onChange={ev => onEscopo(`teste:${ev.target.value}`)}>
                    <option value="">Teste…</option>
                    <optgroup label="Perícias">{SKILLS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
                    <optgroup label="Resistências">{SAVES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
                </select>
            )}
        </div>
    );
}
