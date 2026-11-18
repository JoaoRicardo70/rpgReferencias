// ==========================================
// 🔢 ESCALA DO EFEITO NO EDITOR — lógica pura. Converte os campos do formulário em `escalaContador` / `escalaAliados` do efeito
// (resolvidos em core/efeitos-resolver.js). Soma: valor + fator x contador [+ fator x aliados em campo]; dado de dano não escala.
// ==========================================
import { ATRIBUTO_DANO_DADOS } from './danoDados.js';
import { efeitoPodeValerParaAliados } from './efeitosDeAliados.js';
import { normalizarFiltroAliado, filtroAliadoParaTexto, LIMITE_FATOR_POR_ALIADO } from './aliadosEmCampo.js';

export const ESCALA_VAZIA = Object.freeze({ contadorId: '', fator: '', aliFator: '', aliTipo: '', aliValor: '', paraAliados: false });

const lerFator = (v) => {
    const n = Number(String(v ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) && n !== 0 && Math.abs(n) <= LIMITE_FATOR_POR_ALIADO ? n : null;
};

// { campos: { escalaContador?, escalaAliados? }, erro?: texto }. Sem escala preenchida = campos vazios.
export function montarEscalasDoEfeito(form, atributo) {
    const f = form || ESCALA_VAZIA;
    const campos = {};
    // Marca "vale para aliados" (core/efeitosDeAliados.js): inclusive no dado de dano (que não escala).
    if (f.paraAliados === true && efeitoPodeValerParaAliados(atributo)) campos.valeParaAliados = true;
    if (atributo === ATRIBUTO_DANO_DADOS) return { campos };
    if (f.contadorId) {
        const fator = lerFator(f.fator);
        if (fator === null) return { campos, erro: 'Escalar com contador: informe quanto o efeito ganha por ponto do contador (número diferente de 0, até 1.000.000).' };
        campos.escalaContador = { contadorId: String(f.contadorId), fator };
    }
    if (String(f.aliFator ?? '').trim() !== '') {
        const fator = lerFator(f.aliFator);
        if (fator === null) return { campos, erro: 'Escalar por aliado: informe quanto o efeito ganha por aliado em campo (número diferente de 0, até 1.000.000).' };
        const filtro = f.aliTipo ? normalizarFiltroAliado({ tipo: f.aliTipo, valor: f.aliValor }) : null;
        if (f.aliTipo && !filtro) return { campos, erro: 'Escalar por aliado: escreva o texto do filtro (afiliação, Raça ou Classe) ou escolha "Qualquer aliado".' };
        campos.escalaAliados = { fator, ...(filtro ? { filtro: filtroAliadoParaTexto(filtro) } : {}) };
    }
    return { campos };
}
