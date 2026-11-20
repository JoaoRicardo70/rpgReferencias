// ==========================================
// 📝 Resumo de UM efeito para o cartão do Poder — lógica pura.
// Mostra o valor como o motor o aplica: sinal correto (penalidade "-4", não "+-4"), dado de dano ("+20d6") e, resumidos, o alvo
// (aliados/inimigos), a condição ("quando") e a escala (contador/aliados). Formato base: "[ATRIBUTO] PROPRIEDADE: +valor".
// ==========================================
import { ATRIBUTO_DANO_DADOS, lerDadoDeDano, formatarDadoDeDano, dadoDoEfeito } from './danoDados.js';

export function valorDoEfeitoParaCartao(e) {
    if (!e || typeof e !== 'object') return '+0';
    if (String(e.atributo) === ATRIBUTO_DANO_DADOS) {
        const dado = lerDadoDeDano(dadoDoEfeito(e));
        return dado ? `+${formatarDadoDeDano(dado)}` : `+${String(dadoDoEfeito(e) ?? 0)}`;
    }
    const bruto = e.valor;
    const n = parseFloat(bruto);
    if (Number.isFinite(n) && String(bruto ?? '').trim() !== '' && /^[+-]?\d+([.,]\d+)?$/.test(String(bruto).trim())) return n < 0 ? String(n) : `+${n}`;
    if (typeof bruto === 'number' && Number.isFinite(bruto)) return bruto < 0 ? String(bruto) : `+${bruto}`;
    const t = String(bruto ?? '').trim();
    if (!t) return '+0';
    return /^[+-]/.test(t) ? t : `+${t}`;
}

export function resumirEfeitoParaCartao(e, prefixo = '') {
    if (!e || typeof e !== 'object') return '';
    const atributo = String(e.atributo || '').replace('_', ' ').toUpperCase();
    const extras = [];
    if (e.valeParaInimigos === true) extras.push('inimigos');
    if (e.valeParaAliados === true) extras.push('aliados');
    const quando = String(e.quando ?? '').trim();
    if (quando && quando !== 'sempre') extras.push(`quando ${quando.replace(/_/g, ' ').replace(':', ' ')}`);
    if (e.escalaContador && typeof e.escalaContador === 'object') extras.push('escala com contador');
    if (e.escalaAliados && typeof e.escalaAliados === 'object') extras.push('escala com aliados');
    return `${prefixo}[${atributo}] ${String(e.propriedade || '').toUpperCase()}: ${valorDoEfeitoParaCartao(e)}${extras.length ? ` (${extras.join('; ')})` : ''}`;
}
