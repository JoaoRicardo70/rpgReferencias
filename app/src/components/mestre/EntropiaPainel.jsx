import React, { useCallback, useState } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { enviarParaFeed } from '../../services/firebase-sync';
import { ATRIBUTOS_AGRUPADOS } from '../../core/efeitos-constants';
import {
    entropiasDaFicha, gravarEntropias, normalizarEntropia, normalizarEfeitoEntropia, propriedadesDoEfeito,
    descreverEfeitoEntropia, ATRIBUTO_PODER_DIRETO, LIMITES_ENTROPIA,
} from '../../core/entropia';
import { ATRIBUTO_DANO_DADOS } from '../../core/danoDados';

// 🌀 ENTROPIA DA ENTIDADE (aba do Livro da entidade, só o Mestre): buffs narrativos que a Entidade que rege a campanha
// joga sobre um personagem, NPC ou Boss quando o Mestre decide. Cada Entropia tem nome, descrição e efeitos livres, e liga/desliga.
// Ligada, ela entra nos cálculos da ficha (core/entropia.js) e o dono vê o selo (a menos que esteja oculta).
const EFEITO_VAZIO = { nome: '', atributo: 'forca', propriedade: 'base', valor: '' };

function NovoEfeito({ onAdicionar }) {
    const [e, setE] = useState(EFEITO_VAZIO);
    const props = propriedadesDoEfeito(e.atributo);
    const trocarAtributo = (atributo) => setE(a => ({ ...a, atributo, propriedade: propriedadesDoEfeito(atributo).includes(a.propriedade) ? a.propriedade : propriedadesDoEfeito(atributo)[0] }));
    const adicionar = () => {
        if (!normalizarEfeitoEntropia(e)) return;
        onAdicionar(e);
        setE(EFEITO_VAZIO);
    };
    return (
        <div className="entropia-novo-efeito">
            <input className="input-neon" type="text" placeholder="Nome do efeito (opcional)" value={e.nome} onChange={ev => setE(a => ({ ...a, nome: ev.target.value }))} />
            <select className="input-neon" value={e.atributo} onChange={ev => trocarAtributo(ev.target.value)} aria-label="Atributo do efeito">
                {ATRIBUTOS_AGRUPADOS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                        {g.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ').toUpperCase()}</option>)}
                    </optgroup>
                ))}
                <optgroup label="⚡ POTÊNCIA DO SCOUTER"><option value={ATRIBUTO_PODER_DIRETO}>PODER (DIRETO)</option></optgroup>
            </select>
            {e.atributo !== ATRIBUTO_DANO_DADOS && (
                <select className="input-neon" value={e.propriedade} onChange={ev => setE(a => ({ ...a, propriedade: ev.target.value }))} aria-label="Propriedade do efeito">
                    {props.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
            )}
            <input className="input-neon" type="text" placeholder={e.atributo === ATRIBUTO_DANO_DADOS ? 'Ex.: 50d20' : 'Valor'} value={e.valor} onChange={ev => setE(a => ({ ...a, valor: ev.target.value }))} aria-label="Valor do efeito" />
            <button type="button" className="btn-neon btn-green" onClick={adicionar} disabled={!normalizarEfeitoEntropia(e)} title="Adicionar efeito">+</button>
        </div>
    );
}

export default function EntropiaPainel() {
    const isMestre = useStore(s => s.isMestre);
    const { ficha, updateFicha, nome } = useFichaAtiva();
    const salvar = useCallSaveAtivo();
    const lista = entropiasDaFicha(ficha);

    const mudar = useCallback((fn) => {
        updateFicha((f) => { const atual = entropiasDaFicha(f); fn(atual); gravarEntropias(f, atual); });
        salvar();
    }, [updateFicha, salvar]);

    const alternar = useCallback((id, campo) => {
        let anunciar = null;
        mudar((l) => {
            const en = l.find(x => x.id === id);
            if (!en) return;
            en[campo] = !en[campo];
            if (campo === 'ativa' && en.ativa && !en.oculta) anunciar = en.nome;
        });
        // A Entropia que passa a valer (e não é secreta) vira um aviso da Entidade no feed da mesa.
        if (anunciar) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🌀 A Entropia da Entidade recai sobre ${nome}: ${anunciar}.`, ts: Date.now() });
    }, [mudar, nome]);

    if (!isMestre || !ficha) return null;

    return (
        <div className="entropia-painel">
            <h3 className="entropia-titulo">🌀 Entropia da Entidade — {nome}</h3>
            <p className="entropia-explica">Buffs narrativos que só você aplica, quando decidir. Ligada, a Entropia entra nos cálculos desta ficha (atributos, CA, dano, Reações e Poder). Oculta, o dono não vê o selo. Ao ligar uma Entropia não oculta, a mesa recebe um aviso no feed.</p>

            {lista.length === 0 && <p className="entropia-vazia">Nenhuma Entropia criada para {nome}.</p>}

            {lista.map(en => (
                <div key={en.id} className={`entropia-card${en.ativa ? ' ativa' : ''}`}>
                    <div className="entropia-card-topo">
                        <input key={`${en.id}-n-${en.nome}`} className="input-neon entropia-nome" type="text" maxLength={LIMITES_ENTROPIA.nome} defaultValue={en.nome} onBlur={e => { if (e.target.value !== en.nome) mudar(l => { const x = l.find(y => y.id === en.id); if (x) x.nome = e.target.value; }); }} aria-label="Nome da Entropia" />
                        <button type="button" className={`btn-neon ${en.ativa ? 'btn-gold' : 'btn-green'}`} onClick={() => alternar(en.id, 'ativa')}>{en.ativa ? '🌀 LIGADA (desligar)' : 'Ligar'}</button>
                        <label className="entropia-oculta" title="O dono da ficha não vê o selo nem o aviso"><input type="checkbox" checked={en.oculta} onChange={() => alternar(en.id, 'oculta')} /> 🙈 Oculta</label>
                        <button type="button" className="btn-neon btn-red" onClick={() => { if (window.confirm(`Apagar a Entropia "${en.nome}"?`)) mudar(l => { const i = l.findIndex(y => y.id === en.id); if (i >= 0) l.splice(i, 1); }); }} title="Apagar esta Entropia">🗑</button>
                    </div>
                    <textarea key={`${en.id}-d-${en.descricao}`} className="input-neon entropia-desc" maxLength={LIMITES_ENTROPIA.descricao} placeholder="Descrição narrativa (o que a Entidade faz)..." defaultValue={en.descricao} onBlur={e => { if (e.target.value !== en.descricao) mudar(l => { const x = l.find(y => y.id === en.id); if (x) x.descricao = e.target.value; }); }} aria-label="Descrição da Entropia" />
                    <ul className="entropia-efeitos">
                        {en.efeitos.length === 0 && <li className="entropia-vazia">Sem efeitos: só narrativa.</li>}
                        {en.efeitos.map((ef, i) => (
                            <li key={i}>
                                <span>{ef.nome ? `${ef.nome}: ` : ''}{descreverEfeitoEntropia(ef)}</span>
                                <button type="button" className="btn-neon btn-red entropia-remover" onClick={() => mudar(l => { const x = l.find(y => y.id === en.id); if (x) x.efeitos.splice(i, 1); })} title="Remover efeito" aria-label="Remover efeito">✖</button>
                            </li>
                        ))}
                    </ul>
                    {en.efeitos.length < LIMITES_ENTROPIA.efeitos && <NovoEfeito onAdicionar={(ef) => mudar(l => { const x = l.find(y => y.id === en.id); if (x) x.efeitos.push(ef); })} />}
                </div>
            ))}

            {lista.length < LIMITES_ENTROPIA.entropias && (
                <button type="button" className="btn-neon btn-blue entropia-nova" onClick={() => mudar(l => { l.push(normalizarEntropia({ nome: 'Nova Entropia' })); })}>➕ NOVA ENTROPIA</button>
            )}
        </div>
    );
}
