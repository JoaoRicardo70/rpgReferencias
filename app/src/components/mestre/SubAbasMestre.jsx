import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../stores/useStore';
import useSecaoMestre, { SUBABAS_MESTRE, SUBABA_PADRAO_MESTRE, domDaSecaoMestre, subAbaDaSecaoMestre } from './useSecaoMestre';
import { listarPedidosRaca } from '../../core/racas';

// 🧭 Sub-abas do Painel do Mestre: Combate, Raças, Entidades e Forja. Todos os painéis ficam MONTADOS (preservam rascunhos e inputs);
// os inativos ficam com o atributo `hidden`. A sub-aba escolhida é lembrada em localStorage (rpgMestreSubaba).
// Um pedido do store (pedirSecaoMestre(id)) troca para a sub-aba da seção; a própria seção abre e rola (useSecaoMestre).
export const CHAVE_SUBABA_MESTRE = 'rpgMestreSubaba';

export function SecaoMestreAncora({ id, className = '', children }) {
    useSecaoMestre(id);
    return <div id={domDaSecaoMestre(id)} className={`mestre-secao-ancora ${className}`.trim()}>{children}</div>;
}

const subAbaValida = (v) => SUBABAS_MESTRE.some(s => s.id === v);

export function lerSubAbaMestre() {
    try {
        const v = window.localStorage.getItem(CHAVE_SUBABA_MESTRE);
        return subAbaValida(v) ? v : SUBABA_PADRAO_MESTRE;
    } catch (e) { return SUBABA_PADRAO_MESTRE; }
}

function gravarSubAbaMestre(id) {
    try { window.localStorage.setItem(CHAVE_SUBABA_MESTRE, id); } catch (e) { /* storage bloqueado: segue sem lembrar */ }
}

// `paineis`: { combate, racas, entidades, forja } -> conteúdo de cada sub-aba.
export default function SubAbasMestre({ paineis = {} }) {
    const pedido = useStore(s => s.secaoMestrePedida);
    const personagens = useStore(s => s.personagens);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const pedidosRaca = useMemo(() => listarPedidosRaca({ personagens, meuNome, minhaFicha }).length, [personagens, meuNome, minhaFicha]);
    const [ativa, setAtiva] = useState(lerSubAbaMestre);
    const botoes = useRef({});

    const escolher = useCallback((id) => { setAtiva(id); gravarSubAbaMestre(id); }, []);

    // Pedido de seção (atalhos de outras telas): ativa a sub-aba onde a seção mora.
    useEffect(() => {
        if (!pedido) return;
        const sub = subAbaDaSecaoMestre(pedido.id);
        if (sub && subAbaValida(sub)) escolher(sub);
    }, [pedido, escolher]);

    const aoTeclar = useCallback((ev, indice) => {
        const total = SUBABAS_MESTRE.length;
        let alvo = null;
        if (ev.key === 'ArrowRight') alvo = (indice + 1) % total;
        else if (ev.key === 'ArrowLeft') alvo = (indice - 1 + total) % total;
        else if (ev.key === 'Home') alvo = 0;
        else if (ev.key === 'End') alvo = total - 1;
        if (alvo === null) return;
        ev.preventDefault();
        const id = SUBABAS_MESTRE[alvo].id;
        escolher(id);
        const el = botoes.current[id];
        if (el && typeof el.focus === 'function') el.focus();
    }, [escolher]);

    return (
        <>
            <div className="mestre-subabas" role="tablist" aria-label="Áreas do Painel do Mestre">
                {SUBABAS_MESTRE.map((s, i) => (
                    <button key={s.id} type="button" role="tab" id={`mestre-subaba-${s.id}`} className={`mestre-subaba-btn${ativa === s.id ? ' ativa' : ''}`}
                        aria-selected={ativa === s.id} aria-controls={`mestre-subpainel-${s.id}`} tabIndex={ativa === s.id ? 0 : -1}
                        ref={(el) => { botoes.current[s.id] = el; }}
                        onClick={() => escolher(s.id)} onKeyDown={(ev) => aoTeclar(ev, i)}>
                        <span aria-hidden="true">{s.icone}</span> {s.rotulo}
                        {s.id === 'racas' && pedidosRaca > 0 && <span className="pedido-raca-badge" aria-label={`, ${pedidosRaca} pedido(s) de Raça pendente(s)`}>{pedidosRaca}</span>}
                    </button>
                ))}
            </div>
            {SUBABAS_MESTRE.map(s => (
                <div key={s.id} role="tabpanel" id={`mestre-subpainel-${s.id}`} aria-labelledby={`mestre-subaba-${s.id}`} className="mestre-subpainel" hidden={ativa !== s.id}>
                    {paineis[s.id]}
                </div>
            ))}
        </>
    );
}
