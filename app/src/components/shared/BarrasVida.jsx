import React, { useEffect, useRef, useState } from 'react';

// ==========================================
// 💔 BREAK BARS — camada visual compartilhada pras múltiplas barras de Vida (pedido do usuário,
// referência: HUD de "Break Bars" de RPGs mobile, barras em pílula com losangos indicando quantas
// existem e uma "quebra" animada quando uma delas esvazia). A MECÂNICA em si (quantas barras
// existem, quanto cada uma tem) já vem pronta de fora (core/vitals.js > calcularBarrasVida) — este
// componente só desenha; reaproveitado por Ficha Def/Marcados.jsx, status/StatusSubComponents.jsx,
// mestre/DiarioNPC.jsx e mapa/MapaCombate.jsx pra nunca haver 4 cópias divergentes do mesmo visual
// (foi exatamente essa duplicação, na conta em si, que a revisão de código já pegou uma vez nesta
// mesma funcionalidade).
// ==========================================

// Uma barra individual: detecta a transição "tinha Vida -> chegou a zero" e dispara um flash de
// "quebra" por ~0.6s antes de assentar no visual "quebrada" (escurecida/dessaturada).
function BarraQuebravel({ atual, maximo, cor, corTexto, altura, perigo, mostrarTexto, renderTexto }) {
    const tinhaVidaRef = useRef((Number(atual) || 0) > 0);
    const [quebrando, setQuebrando] = useState(false);

    useEffect(() => {
        const zerada = (Number(atual) || 0) <= 0;
        if (zerada && tinhaVidaRef.current) {
            tinhaVidaRef.current = false;
            setQuebrando(true);
            const t = setTimeout(() => setQuebrando(false), 600);
            return () => clearTimeout(t);
        }
        // Curou/regenerou antes do flash de 600ms terminar (o cleanup acima já cancelou aquele
        // timeout) — encerra o flash na hora em vez de deixar "quebrando" preso em true até a
        // barra zerar de novo e completar um ciclo inteiro sem interrupção.
        if (!zerada) { tinhaVidaRef.current = true; setQuebrando(false); }
    }, [atual]);

    const atualSeguro = Number(atual) || 0;
    const maxSeguro = Number(maximo) || 0;
    const pct = maxSeguro > 0 ? Math.min(100, Math.max(0, (atualSeguro / maxSeguro) * 100)) : 0;
    const quebrada = atualSeguro <= 0;

    let corPreenchimento = cor;
    if (perigo) { if (pct <= 20) corPreenchimento = '#ff3030'; else if (pct <= 50) corPreenchimento = '#ffcc00'; }

    return (
        <div className={`break-bars-barra ${quebrada ? 'break-bars-barra--quebrada' : ''}`} style={{ height: altura }}>
            <div className="break-bars-barra__preenchimento" style={{ width: `${pct}%`, background: corPreenchimento, boxShadow: `0 0 6px ${corPreenchimento}` }} />
            {quebrando && <div className="break-bars-barra__flash" />}
            {mostrarTexto && (
                <div className="break-bars-barra__texto" style={{ color: corTexto, fontSize: altura >= 30 ? '1.2em' : '0.75em' }}>
                    {renderTexto ? renderTexto(atualSeguro, maxSeguro) : (
                        <span>{atualSeguro.toLocaleString('pt-BR')} / {maxSeguro.toLocaleString('pt-BR')}</span>
                    )}
                </div>
            )}
        </div>
    );
}

// barras: [{ atual, max }, ...] na mesma ordem de core/vitals.js > calcularBarrasVida (índice 0 =
// barra da frente, primeira a esvaziar/última a se recuperar). renderTexto(atual, max, indice):
// opcional — customiza o conteúdo de dentro de cada barra (ex.: um campo editável); sem isso, cai
// no texto padrão "atual / max". mostrarTexto=false esconde o texto de todas (útil pra barras bem
// finas, tipo a moldura de combate do Mapa, que já mostra o número em outro lugar).
export default function BarrasVida({ barras, cor, corTexto = '#fff', altura = 40, mostrarPips = true, mostrarTexto = true, perigo = false, renderTexto }) {
    if (!barras || barras.length === 0) return null;

    return (
        <div className="break-bars-container" style={{ '--break-bars-cor': cor }}>
            {mostrarPips && barras.length > 1 && (
                <div className="break-bars-pips">
                    {barras.map((b, i) => (
                        <span key={i} className={`break-bars-pip ${(Number(b.atual) || 0) > 0 ? 'break-bars-pip--cheia' : 'break-bars-pip--quebrada'}`} />
                    ))}
                </div>
            )}
            {barras.map((b, i) => (
                <BarraQuebravel
                    key={i}
                    atual={b.atual}
                    maximo={b.max}
                    cor={cor}
                    corTexto={corTexto}
                    altura={altura}
                    perigo={perigo}
                    mostrarTexto={mostrarTexto}
                    renderTexto={renderTexto ? (atualSeguro, maxSeguro) => renderTexto(atualSeguro, maxSeguro, i) : undefined}
                />
            ))}
        </div>
    );
}
