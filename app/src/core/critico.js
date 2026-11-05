// ==========================================
// 💥 CRÍTICO — lógica pura. Há DOIS críticos com faixas de d20 e multiplicadores próprios (core/engine.js > calcularDano):
//   • Crítico (normal): faixa padrão 16-18, dano x2.
//   • Crítico Fatal:    faixa padrão 19-20, dano x4.
// Efeitos da ficha mexem em cada um separadamente (valor = N, "o crítico começa em N"; vale o MENOR N entre os efeitos):
//   margem_critico        -> o Crítico começa em N        (14 = Crítico de 14 até onde o Fatal começa)
//   margem_critico_fatal  -> o Crítico Fatal começa em N  (19 = Fatal em 19-20)
// O Fatal tem prioridade: quando ele desce, a faixa do Crítico normal termina um número antes dele.
// ==========================================
export const FAIXAS_CRITICO_PADRAO = { normalMin: 16, normalMax: 18, fatalMin: 19, fatalMax: 20 };

const MIN_DADO = 2; // com 1 todo dado seria crítico
const MAX_DADO = 20;
const limitar = (n) => Math.max(MIN_DADO, Math.min(MAX_DADO, Math.floor(Number(n))));

// Faixas finais: a configuração da ficha (padrão 16-18 / 19-20) abaixada pelas margens dos efeitos (null = sem efeito).
export function calcularFaixasCritico(config = {}, margemNormal = null, margemFatal = null) {
    const c = { ...FAIXAS_CRITICO_PADRAO };
    ['normalMin', 'normalMax', 'fatalMin', 'fatalMax'].forEach((k) => { if (Number.isFinite(Number(config[k])) && Number(config[k]) > 0) c[k] = Number(config[k]); });
    let { normalMin, normalMax, fatalMin, fatalMax } = c;
    if (Number.isFinite(margemFatal) && margemFatal !== null) {
        fatalMin = Math.min(fatalMin, limitar(margemFatal));
        fatalMax = Math.max(fatalMax, fatalMin);
        normalMax = Math.min(normalMax, fatalMin - 1); // o Fatal tem prioridade sobre a mesma faixa
    }
    if (Number.isFinite(margemNormal) && margemNormal !== null) normalMin = Math.min(normalMin, limitar(margemNormal));
    return { normalMin, normalMax, fatalMin, fatalMax };
}

// Que crítico um d20 natural dá? 'fatal', 'normal' ou null (sem crítico). Dado inválido não dá crítico.
export function classificarCritico(dado, faixas = FAIXAS_CRITICO_PADRAO) {
    const d = Number(dado);
    if (!Number.isFinite(d) || d <= 0) return null;
    if (d >= faixas.fatalMin && d <= faixas.fatalMax) return 'fatal';
    if (d >= faixas.normalMin && d <= faixas.normalMax) return 'normal';
    return null;
}

// Lê o maior número de uma rolagem em HTML do feed (formato antigo, sem dadoNatural): <strong>N</strong> ou [a, b]. 0 se não achar.
export function maiorDadoDaRolagem(rolagemHtml) {
    const texto = String(rolagemHtml || '');
    let maior = 0;
    const regexStrong = /<strong>(\d+)<\/strong>/g;
    let m;
    while ((m = regexStrong.exec(texto)) !== null) maior = Math.max(maior, parseInt(m[1], 10));
    if (maior === 0) {
        const arr = /\[(.*?)\]/.exec(texto);
        if (arr) {
            const nums = arr[1].replace(/<[^>]*>?/gm, '').split(',').map(n => parseInt(n.trim(), 10)).filter(n => !Number.isNaN(n));
            if (nums.length) maior = Math.max(...nums);
        }
    }
    return maior;
}
