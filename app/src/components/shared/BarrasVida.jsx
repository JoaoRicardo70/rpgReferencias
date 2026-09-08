import React, { useEffect, useRef, useState } from 'react';

// ==========================================
// 💔 BREAK BARS — camada visual compartilhada pras múltiplas barras de Vida (pedido do usuário,
// referência: HUD de "Break Bars" de RPGs mobile, barras empilhadas uma sobre a outra, cada uma
// com sua própria cor, e uma "quebra" animada quando uma delas esvazia). A MECÂNICA em si (quantas
// barras existem, quanto cada uma tem) já vem pronta de fora (core/vitals.js > calcularBarrasVida)
// — este componente só desenha; reaproveitado por Ficha Def/Marcados.jsx,
// status/StatusSubComponents.jsx, mestre/DiarioNPC.jsx e mapa/MapaCombate.jsx pra nunca haver 4
// cópias divergentes do mesmo visual (foi exatamente essa duplicação, na conta em si, que a
// revisão de código já pegou uma vez nesta mesma funcionalidade).
// ==========================================

function hexParaRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    if (isNaN(num)) return { r: 255, g: 255, b: 255 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbParaHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) { h = 0; s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslParaHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, s)) / 100;
    l = Math.min(100, Math.max(0, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 🎨 Uma cor DIFERENTE por barra (pedido do usuário — facilita diferenciar cada uma no visual
// empilhado), derivada da cor base do próprio vital (gira o matiz mantendo saturação/luminosidade
// parecidas, pra continuar "combinando" com o tema daquele vital em vez de virar cores aleatórias).
// Sem personalização manual por enquanto (decisão do usuário) — só essa paleta automática.
// "indice" aqui já vem INVERTIDO pelo chamador (ver "indiceCorInvertido" abaixo) — quem chama com
// indice=0 é sempre a ÚLTIMA barra (a reserva mais profunda), que fica com a cor base intocada;
// as anteriores (a que esvazia primeiro incluída) é que recebem a rotação.
function corDaBarra(corBase, indice) {
    if (!indice) return corBase;
    const { r, g, b } = hexParaRgb(corBase);
    const { h, s, l } = rgbParaHsl(r, g, b);
    // 🎨 Cor base sem saturação (preto/branco/qualquer cinza — a Ficha antiga tem um seletor de
    // cor livre pra Vida em StatusFormContext.jsx, então isso É alcançável pelo usuário) faria
    // girar o matiz não ter efeito nenhum (toda rotação de matiz de um cinza continua o MESMO
    // cinza) — todas as barras colapsariam de volta pra uma cor só, matando a própria mudança
    // pedida aqui. Preto/branco puro (luminosidade 0 ou 100) têm o mesmo problema mesmo com
    // saturação: nesses extremos NENHUMA cor tem "matiz" visível. Garante uma saturação e uma
    // luminosidade mínimas só pra decidir a cor das barras que não são a última; "s"/"l" seguros
    // aqui NUNCA são salvos em lugar nenhum, só usados nesta conta.
    const sSegura = Math.max(s, 40);
    const lSegura = Math.min(85, Math.max(15, l));
    return hslParaHex(h + indice * 35, sSegura, lSegura);
}

// 🩸 Pedido do usuário: a barra vermelha (cor base do vital) deve ser a ÚLTIMA da pilha (a reserva
// final, mais crítica), não a primeira/frente — inverte o índice antes de mandar pra corDaBarra.
function indiceCorInvertido(i, total) {
    return total - 1 - i;
}

// Uma barra individual: detecta a transição "tinha Vida -> chegou a zero" e dispara um flash de
// "quebra" por ~0.6s antes de assentar no visual "quebrada" (escurecida/dessaturada).
function BarraQuebravel({ atual, maximo, cor, corTexto, altura, perigo, mostrarTexto, renderTexto, posicaoStyle }) {
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
        <div className={`break-bars-barra ${quebrada ? 'break-bars-barra--quebrada' : ''}`} style={{ height: altura, ...posicaoStyle }}>
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
//
// 🃏 EMPILHAMENTO (pedido do usuário — "cada barra EXATAMENTE uma sobre a outra", sem nenhum
// deslocamento diagonal): todas as barras ocupam o MESMO espaço (top:0, left:0, right:0), uma
// literalmente por cima da outra. A barra ainda com Vida (>0) de MENOR índice fica por cima de
// tudo (z-index mais alto) — é sempre ela a "ativa"/atual, a única visível e a que o jogador
// precisa ler; barras já quebradas (atual<=0) caem pra trás da pilha (z-index mais baixo, visual
// escurecido e completamente coberta pela de cima) assim que a próxima barra vira a ativa,
// revelando-a por cima. A fileira de losangos ("pips") acima é quem mostra quantas barras existem
// no total — as próprias barras, sobrepostas, só deixam ver a de cima.
export default function BarrasVida({ barras, cor, corTexto = '#fff', altura = 40, mostrarPips = true, mostrarTexto = true, perigo = false, renderTexto }) {
    if (!barras || barras.length === 0) return null;

    const numBarras = barras.length;
    const empilhado = numBarras > 1;

    const bars = barras.map((b, i) => (
        <BarraQuebravel
            key={i}
            atual={b.atual}
            maximo={b.max}
            cor={corDaBarra(cor, indiceCorInvertido(i, numBarras))}
            corTexto={corTexto}
            altura={altura}
            perigo={perigo}
            mostrarTexto={mostrarTexto}
            renderTexto={renderTexto ? (atualSeguro, maxSeguro) => renderTexto(atualSeguro, maxSeguro, i) : undefined}
            posicaoStyle={empilhado ? {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                // Isolado do resto da página via .break-bars-pilha { isolation: isolate }
                // (styles.css) — estes números só importam ENTRE si, dentro desta pilha.
                zIndex: ((Number(b.atual) || 0) > 0 ? 10 : 0) + (numBarras - i),
            } : undefined}
        />
    ));

    return (
        <div className="break-bars-container" style={{ '--break-bars-cor': cor }}>
            {mostrarPips && empilhado && (
                <div className="break-bars-pips">
                    {barras.map((b, i) => (
                        <span
                            key={i}
                            className={`break-bars-pip ${(Number(b.atual) || 0) > 0 ? 'break-bars-pip--cheia' : 'break-bars-pip--quebrada'}`}
                            style={{ '--break-bars-cor': corDaBarra(cor, indiceCorInvertido(i, numBarras)) }}
                        />
                    ))}
                </div>
            )}
            {empilhado ? (
                <div className="break-bars-pilha" style={{ height: altura }}>{bars}</div>
            ) : bars}
        </div>
    );
}
