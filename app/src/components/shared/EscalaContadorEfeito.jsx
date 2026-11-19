import React from 'react';
import { efeitoPodeValerParaAliados } from '../../core/efeitosDeAliados';
import { efeitoPodeValerParaInimigos } from '../../core/efeitosDeInimigos';
import { efeitoAceitaEscalaMovimento, LIMITE_MAX_ESCALA_MOVIMENTO } from '../../core/movimentoNoTurno';

// 🔢 "Escalar com contador" e "Escalar por aliado em campo" (core/efeitos-resolver.js): o efeito passa a valer
// valor + fator × valor do contador (+ fator × aliados da cena ativa); e, em atributos de ataque, "vale também para aliados em campo" (core/efeitosDeAliados.js). `valor` = { contadorId, fator, aliFator, aliTipo, aliValor } (core/escalaEfeito.js).
// `contadores`: lista { id, nome } (os da ficha e os do rascunho do poder). Não vale para dado de dano.
export default function EscalaContadorEfeito({ atributo, contadores, valor, onChange }) {
    // Dado de dano não escala (só pode valer para aliados).
    const semEscala = atributo === 'dano_dados';
    const lista = Array.isArray(contadores) ? contadores : [];
    const v = valor || {};
    const mudar = (campo, novo) => onChange({ ...v, [campo]: novo });
    const podeAliados = efeitoPodeValerParaAliados(atributo);
    const podeInimigos = efeitoPodeValerParaInimigos(atributo);
    const podeMovimento = efeitoAceitaEscalaMovimento(atributo);
    if (semEscala && !podeAliados && !podeMovimento) return null;
    return (
        <div className="condicao-efeito">
            {podeAliados && (
                <label className="condicao-efeito-campo" title="Os aliados na cena ativa também recebem este efeito (avaliado no ataque deles; ex.: contra a Presa marcada).">
                    <input type="checkbox" checked={!!v.paraAliados} onChange={ev => mudar('paraAliados', ev.target.checked)} /> <span>Vale também para aliados em campo</span>
                </label>
            )}
            {podeInimigos && (
                <label className="condicao-efeito-campo" title="Penalidade (use valor NEGATIVO, até -20 somados) para os INIMIGOS do portador na cena ativa, enquanto a condição do efeito valer para o portador (ex.: Há alguém com o estado Presa em campo).">
                    <input type="checkbox" checked={!!v.paraInimigos} onChange={ev => mudar('paraInimigos', ev.target.checked)} /> <span>Penalidade para os inimigos em campo</span>
                </label>
            )}
            {podeMovimento && (
                <label className="condicao-efeito-campo">
                    <span>Escalar com movimento (por quadrado)</span>
                    <input type="number" step="any" placeholder="+ por quadrado" aria-label="Quanto o efeito ganha por quadrado percorrido no turno" title={semEscala ? 'Dado de dano: o dado do efeito vale POR quadrado (fator multiplica). Só conta em combate.' : 'Valor final = valor do efeito + fator x quadrados percorridos no turno (só em combate). Vazio = não escala.'} value={v.movFator || ''} onChange={ev => mudar('movFator', ev.target.value)} />
                    <input type="number" min="1" max={LIMITE_MAX_ESCALA_MOVIMENTO} step="1" placeholder="teto de quadrados" aria-label="Teto de quadrados contados (obrigatório, 1 a 100)" title={`Teto de quadrados contados pelo efeito (obrigatório, 1 a ${LIMITE_MAX_ESCALA_MOVIMENTO}).`} value={v.movMax || ''} onChange={ev => mudar('movMax', ev.target.value)} />
                </label>
            )}
            {!semEscala && (lista.length > 0 || v.contadorId) && (
                <label className="condicao-efeito-campo">
                    <span>Escalar com contador</span>
                    <select value={v.contadorId || ''} aria-label="Contador que escala o efeito" onChange={ev => mudar('contadorId', ev.target.value)}>
                        <option value="">Não escalar</option>
                        {lista.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </label>
            )}
            {!semEscala && v.contadorId && (
                <input type="number" step="any" placeholder="+ por ponto" aria-label="Quanto o efeito ganha por ponto do contador" title="Valor final = valor do efeito + fator x valor do contador" value={v.fator || ''} onChange={ev => mudar('fator', ev.target.value)} />
            )}
            {!semEscala && <label className="condicao-efeito-campo">
                <span>Por aliado em campo</span>
                <input type="number" step="any" placeholder="+ por aliado" aria-label="Quanto o efeito ganha por aliado em campo (cena ativa)" title="Valor final = valor do efeito + fator x aliados na cena ativa (conscientes ou não). Vazio = não escala." value={v.aliFator || ''} onChange={ev => mudar('aliFator', ev.target.value)} />
            </label>}
            {!semEscala && String(v.aliFator ?? '').trim() !== '' && (
                <>
                    <select value={v.aliTipo || ''} aria-label="Filtro dos aliados que contam" onChange={ev => mudar('aliTipo', ev.target.value)}>
                        <option value="">Qualquer aliado</option>
                        <option value="afiliacao">Da afiliação…</option>
                        <option value="raca">Da Raça…</option>
                        <option value="classe">Da Classe…</option>
                    </select>
                    {v.aliTipo && <input type="text" placeholder="texto do filtro" aria-label="Texto do filtro dos aliados" value={v.aliValor || ''} onChange={ev => mudar('aliValor', ev.target.value.replace(/[:|]/g, ' '))} />}
                </>
            )}
        </div>
    );
}
