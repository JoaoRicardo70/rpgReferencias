import React from 'react';
import { opcoesQuandoPara, ehPropriedadeMultiplicador, OPCOES_ESCOPO, ATRIBUTOS_COM_QUANDO, ATRIBUTOS_COM_ESCOPO, ATRIBUTOS_COM_ESCOPO_ESTADO, ESCOPO_TODOS_OS_ESTADOS } from '../../core/efeitosCondicionais';
import { ESTADOS } from '../../core/condicoes';
import { SKILLS, SAVES } from '../combate/TestesFormContext';

// Condições que não pedem complemento depois dos dois pontos.
const SEM_ARGUMENTO = ['em_combate', 'empunhando_arma', 'alvo_com_debuff', 'primeiro_ataque_do_turno'];

const partir = (valor) => {
    const [base, ...resto] = String(valor || '').split(':');
    return { base, arg: resto.join(':'), temArg: resto.length > 0 };
};

// ❓ Condição ("quando") e escopo opcionais de um efeito (core/efeitosCondicionais.js). Os valores são os mesmos que o efeito guarda
// ('empunhando_arma:espada', 'alvo_com_estado:surpreso', 'teste:intuicao'); vazio = sem condição / padrão do efeito.
// `propriedade` (opcional): nos multiplicadores (mgeral...) o Quando aparece com só as condições que dependem da própria ficha.
export default function CondicaoDoEfeito({ atributo, propriedade, quando, onQuando, escopo, onEscopo }) {
    const q = partir(quando);
    const e = partir(escopo);
    const baseQuando = q.base || 'sempre';
    const baseEscopo = e.base || '';
    const comEscopo = ATRIBUTOS_COM_ESCOPO.includes(atributo);
    const comEscopoEstado = ATRIBUTOS_COM_ESCOPO_ESTADO.includes(atributo);
    // Só os atributos que leem a condição mostram o "Quando" (nos outros ela seria ignorada).
    const ehMult = ehPropriedadeMultiplicador(propriedade);
    if (!ATRIBUTOS_COM_QUANDO.includes(atributo) && !ehMult) return null;
    const idDoTeste = [...SKILLS, ...SAVES].find(t => t.id.toLowerCase() === e.arg.toLowerCase());

    const trocarQuando = (base) => {
        if (base === 'sempre') onQuando('');
        else if (SEM_ARGUMENTO.includes(base)) onQuando(base);
        else onQuando(`${base}:`);
    };
    const trocarEscopo = (base) => onEscopo(base === 'teste:' ? 'teste:' : base);

    return (
        <div className="condicao-efeito">
            <label className="condicao-efeito-campo">
                <span>Quando</span>
                <select value={baseQuando} aria-label="Condição do efeito" onChange={ev => trocarQuando(ev.target.value)}>
                    {opcoesQuandoPara(propriedade).map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
            </label>
            {baseQuando === 'alvo_com_estado' && (
                <select value={q.arg} aria-label="Estado do alvo" onChange={ev => onQuando(`alvo_com_estado:${ev.target.value}`)}>
                    <option value="">Estado…</option>
                    {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.icone} {s.nome}</option>)}
                </select>
            )}
            {baseQuando === 'alvo_defende_com' && (
                <select value={q.arg} aria-label="Defesa do alvo" onChange={ev => onQuando(`alvo_defende_com:${ev.target.value}`)}>
                    <option value="">Defesa…</option>
                    <option value="evasiva">Evasiva (Indesviável)</option>
                    <option value="resistencia">Resistência (Imbloqueável)</option>
                </select>
            )}
            {baseQuando === 'eu_com_estado' && (
                <select value={q.arg} aria-label="Estado do portador" onChange={ev => onQuando(`eu_com_estado:${ev.target.value}`)}>
                    <option value="">Estado…</option>
                    {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.icone} {s.nome}</option>)}
                </select>
            )}
            {baseQuando === 'estado_em_campo' && (
                <select value={q.arg} aria-label="Estado em campo" onChange={ev => onQuando(`estado_em_campo:${ev.target.value}`)}>
                    <option value="">Estado…</option>
                    {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.icone} {s.nome}</option>)}
                </select>
            )}
            {baseQuando === 'alvo_vida_abaixo' && (
                <input type="number" min="1" max="100" placeholder="%" aria-label="Vida do alvo abaixo de (%)" value={q.arg} onChange={ev => onQuando(`alvo_vida_abaixo:${ev.target.value}`)} />
            )}
            {baseQuando === 'combos_finalizados' && (
                <input type="number" min="1" max="999" placeholder="N" aria-label="Combos finalizados (mínimo)" value={q.arg} onChange={ev => onQuando(`combos_finalizados:${ev.target.value}`)} />
            )}
            {baseQuando === 'aliados_em_campo' && (() => {
                // arg = "N" ou "N:tipo=valor" (core/aliadosEmCampo.js); aliados da CENA ATIVA, conscientes ou não.
                const [nTxt, ...resto] = q.arg.split(':');
                const filtro = resto.join(':');
                const i = filtro.indexOf('=');
                const tipoF = i >= 0 ? filtro.slice(0, i) : '';
                const valorF = i >= 0 ? filtro.slice(i + 1) : '';
                const montar = (n, t, v) => onQuando(`aliados_em_campo:${n}${t ? `:${t}=${v}` : ''}`);
                return (
                    <>
                        <input type="number" min="1" max="200" placeholder="N" aria-label="Aliados em campo (mínimo)" value={nTxt} onChange={ev => montar(ev.target.value, tipoF, valorF)} />
                        <select value={tipoF} aria-label="Filtro dos aliados" onChange={ev => montar(nTxt, ev.target.value, valorF || '')}>
                            <option value="">Qualquer aliado</option>
                            <option value="afiliacao">Da afiliação…</option>
                            <option value="raca">Da Raça…</option>
                            <option value="classe">Da Classe…</option>
                        </select>
                        {tipoF && <input type="text" placeholder="texto do filtro" aria-label="Texto do filtro dos aliados" value={valorF} onChange={ev => montar(nTxt, tipoF, ev.target.value.replace(/[:|]/g, ' '))} />}
                    </>
                );
            })()}
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
