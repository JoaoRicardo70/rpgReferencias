// ==========================================
// 🩸 Dano na Vida com o contexto do app: o mesmo core/danoVida.js > aplicarDanoNaVida, já sabendo em que CENA a mesa está
// (limites de gatilho "por cena"). Use dentro de updateFicha (rascunho) ou numa cópia da ficha.
// ==========================================
import useStore from '../stores/useStore';
import { aplicarDanoNaVida, novoEventoId } from '../core/danoVida';

export function cenaAtualDaMesa() {
    try {
        const st = typeof useStore.getState === 'function' ? useStore.getState() : null;
        return (st && st.cenario && st.cenario.ativa) || 'default';
    } catch (e) { return 'default'; }
}

export function aplicarDanoNaVidaDaFicha(ficha, danoExibido, ctx = {}) {
    return aplicarDanoNaVida(ficha, danoExibido, { cenaId: cenaAtualDaMesa(), ...ctx });
}

// Frase única dos gatilhos/imunidade para o feed ('' se nada disparou).
export const textoDosGatilhos = (r) => (r && r.textos && r.textos.length > 0 ? `🔔 ${r.textos.join(' · ')}` : '');

export { novoEventoId };
