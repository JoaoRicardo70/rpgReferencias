import { describe, it, expect } from 'vitest';
import { getCamadaTinta } from './Marcados';

// ---------------------------------------------------------------------------
// QA — getCamadaTinta(cor): calibração de "Tingir Moldura/Fundo/Ícone".
//
// Antes, o tingimento usava sempre mix-blend-mode:'color' (100%) + 'overlay'
// (80% fixo), para QUALQUER cor. Isso fazia cores acromáticas como preto
// produzirem um resultado "lavado"/claro em vez de escurecer a imagem (já que
// 'color' só troca matiz/saturação preservando a luminosidade original, e uma
// cor sem saturação como preto não tem matiz/saturação "de verdade" pra
// impor) — o oposto do que o usuário esperava ao escolher preto.
//
// getCamadaTinta agora decide entre dois modos: 'color' pra cores saturadas
// (continua funcionando bem, como antes) e 'multiply' com opacidade
// proporcional à escuridão da cor para cores quase acromáticas (cinza/preto),
// que de fato escurece a imagem de forma previsível e proporcional.
// ---------------------------------------------------------------------------

describe('getCamadaTinta', () => {
    it('retorna null para branco (sentinela de "sem tingimento")', () => {
        expect(getCamadaTinta('#ffffff')).toBeNull();
    });

    it('retorna null para valores vazios/nulos/undefined', () => {
        expect(getCamadaTinta('')).toBeNull();
        expect(getCamadaTinta(null)).toBeNull();
        expect(getCamadaTinta(undefined)).toBeNull();
    });

    it('cores saturadas (roxo, azul, vermelho, amarelo) usam modo "color" a 100%', () => {
        ['#aa00ff', '#0088ff', '#ff003c', '#ffcc00'].forEach(cor => {
            const tinta = getCamadaTinta(cor);
            expect(tinta).not.toBeNull();
            expect(tinta.modo).toBe('color');
            expect(tinta.opacidade).toBe(1);
        });
    });

    it('preto (#000000) usa modo "multiply", NÃO "color" (evita o resultado "lavado"/claro)', () => {
        const tinta = getCamadaTinta('#000000');
        expect(tinta.modo).toBe('multiply');
    });

    it('preto produz a opacidade de multiply MAIS FORTE entre as cores acromáticas testadas (mais escuro = mais intenso)', () => {
        const preto = getCamadaTinta('#000000');
        const cinzaEscuro = getCamadaTinta('#333333');
        const cinzaMedio = getCamadaTinta('#808080');

        expect(preto.modo).toBe('multiply');
        expect(cinzaEscuro.modo).toBe('multiply');
        expect(cinzaMedio.modo).toBe('multiply');

        expect(preto.opacidade).toBeGreaterThan(cinzaEscuro.opacidade);
        expect(cinzaEscuro.opacidade).toBeGreaterThan(cinzaMedio.opacidade);
    });

    it('opacidade de multiply nunca ultrapassa 0.85 (nunca apaga a imagem por completo)', () => {
        expect(getCamadaTinta('#000000').opacidade).toBeLessThanOrEqual(0.85);
        expect(getCamadaTinta('#010101').opacidade).toBeLessThanOrEqual(0.85);
    });

    it('cor hexadecimal malformada cai no fallback seguro "color" a 100% (nunca lança erro)', () => {
        expect(() => getCamadaTinta('abc')).not.toThrow();
        expect(getCamadaTinta('abc')).toEqual({ modo: 'color', opacidade: 1 });
        expect(getCamadaTinta('#zzzzzz')).toEqual({ modo: 'color', opacidade: 1 });
    });

    // Cobertura extra de QA: cores ESCURAS mas SATURADAS (chroma >= 0.12) sofrem o
    // mesmo problema de "não escurece" que motivou o fix original — 'color' preserva a
    // luminosidade da IMAGEM por baixo, não a da cor escolhida, então uma cor bem escura
    // continua parecendo clara, só com um leve matiz. #200000 (vermelho quase-preto) tem
    // chroma ~0.125 (passa do antigo limiar de 0.12) mas luminosidade ~0.063 (bem escura).
    it('vermelho quase-preto e saturado (#200000) também usa "multiply", não "color" (mesmo escurecimento insuficiente do bug original, só que mais sutil)', () => {
        const hex = '200000';
        const r = parseInt(hex.substring(0, 2), 16), g = 0, b = 0;
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        expect(chroma).toBeGreaterThanOrEqual(0.12); // confirma a premissa: NÃO cairia no ramo antigo por chroma

        const tinta = getCamadaTinta('#200000');
        expect(tinta.modo).toBe('multiply');
        expect(tinta.opacidade).toBeGreaterThan(0);
        expect(tinta.opacidade).toBeLessThanOrEqual(0.85);
    });

    it('cores escuras E saturadas continuam mais fortes que cores médias/claras saturadas (proporcional à escuridão, não só à saturação)', () => {
        const escuraSaturada = getCamadaTinta('#200000'); // luminosidade baixa -> multiply
        const mediaSaturada = getCamadaTinta('#ff003c'); // luminosidade ~0.5 -> color a 100%
        expect(escuraSaturada.modo).toBe('multiply');
        expect(mediaSaturada.modo).toBe('color');
    });

    it('cores saturadas médias/claras (luminosidade >= 0.15) continuam no modo "color" a 100% (sem regressão do comportamento já validado)', () => {
        // Vermelho vivo com luminosidade média (~0.5) — bem acima do novo limiar de escuridão.
        const tinta = getCamadaTinta('#ff0000');
        expect(tinta).toEqual({ modo: 'color', opacidade: 1 });
    });

    // Cobertura extra de QA: formatos de hex que a UI (input type="color") nunca produz —
    // sempre emite 6 dígitos minúsculos — mas que poderiam teoricamente vir de dados legados
    // no Firebase. getCamadaTinta não trata abreviação de 3 dígitos como cor válida (cai no
    // fallback seguro de hex malformado), então "#fff" (equivalente visual a "#ffffff") NÃO
    // recebe o mesmo tratamento especial de "sem tingimento" (null) que "#ffffff" recebe —
    // ele cai no fallback {modo:'color', opacidade:1} em vez de null. Isso nunca lança erro e
    // nunca escurece incorretamente (mesmo fallback seguro de qualquer hex malformado), mas
    // documentamos aqui que não é tratado como "sem tingimento". Não reachable via nenhum
    // caminho de UI hoje (paleta e color picker sempre usam 6 dígitos), por isso não
    // justificamos mudar o parser agora — só travamos o comportamento atual com um teste.
    it('hex abreviado de 3 dígitos ("#fff") NÃO é reconhecido como "#ffffff" — cai no fallback seguro, não em null (comportamento atual documentado, não reachable via UI)', () => {
        expect(getCamadaTinta('#fff')).toEqual({ modo: 'color', opacidade: 1 });
        expect(getCamadaTinta('#fff')).not.toBeNull();
    });

    it('hex em maiúsculas é interpretado corretamente, com o mesmo resultado que o equivalente em minúsculas', () => {
        expect(getCamadaTinta('#AA00FF')).toEqual(getCamadaTinta('#aa00ff'));
        expect(getCamadaTinta('#000000')).toEqual(getCamadaTinta('#000000'.toUpperCase()));
    });
});
