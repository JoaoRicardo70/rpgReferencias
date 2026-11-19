// ==========================================
// 🔢 ESCALA DO EFEITO NO EDITOR — lógica pura. Converte os campos do formulário em `escalaContador` / `escalaAliados` / `escalaMovimento` do efeito
// (resolvidos em core/efeitos-resolver.js). Soma: valor + fator x contador [+ fator x aliados em campo] [+ fator x quadrados percorridos, com teto];
// dado de dano só escala por movimento ("NdM por quadrado", sempre com teto). Também marca o efeito como "vale para aliados" / "vale como penalidade para inimigos".
// ==========================================
import { ATRIBUTO_DANO_DADOS } from './danoDados.js';
import { efeitoPodeValerParaAliados } from './efeitosDeAliados.js';
import { efeitoPodeValerParaInimigos } from './efeitosDeInimigos.js';
import { normalizarFiltroAliado, filtroAliadoParaTexto, LIMITE_FATOR_POR_ALIADO } from './aliadosEmCampo.js';
import { efeitoAceitaEscalaMovimento, normalizarEscalaMovimento, LIMITE_MAX_ESCALA_MOVIMENTO } from './movimentoNoTurno.js';

export const ESCALA_VAZIA = Object.freeze({ contadorId: '', fator: '', aliFator: '', aliTipo: '', aliValor: '', paraAliados: false, paraInimigos: false, movFator: '', movMax: '' });

const lerFator = (v) => {
    const n = Number(String(v ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) && n !== 0 && Math.abs(n) <= LIMITE_FATOR_POR_ALIADO ? n : null;
};

// { campos: { escalaContador?, escalaAliados?, escalaMovimento?, valeParaAliados?, valeParaInimigos? }, erro?: texto }. Sem escala preenchida = campos vazios.
export function montarEscalasDoEfeito(form, atributo) {
    const f = form || ESCALA_VAZIA;
    const campos = {};
    // Marca "vale para aliados" (core/efeitosDeAliados.js): inclusive no dado de dano (que não escala por contador/aliado).
    if (f.paraAliados === true && efeitoPodeValerParaAliados(atributo)) campos.valeParaAliados = true;
    // Marca "penalidade para os inimigos do portador" (core/efeitosDeInimigos.js): só Evasiva, Resistência e Acerto.
    if (f.paraInimigos === true && efeitoPodeValerParaInimigos(atributo)) campos.valeParaInimigos = true;
    // 👣 Escala por movimento: fator por quadrado e TETO de quadrados obrigatório (1 a 100).
    if (String(f.movFator ?? '').trim() !== '' || String(f.movMax ?? '').trim() !== '') {
        if (efeitoAceitaEscalaMovimento(atributo)) {
            const fator = lerFator(f.movFator);
            const esc = fator === null ? null : normalizarEscalaMovimento({ fator, max: Number(String(f.movMax ?? '').trim()) });
            if (!esc) return { campos, erro: `Escalar com movimento: informe o fator por quadrado (número diferente de 0) e o TETO de quadrados contados (inteiro de 1 a ${LIMITE_MAX_ESCALA_MOVIMENTO}).` };
            if (atributo === ATRIBUTO_DANO_DADOS && esc.fator < 0) return { campos, erro: 'Escalar com movimento: no dado de dano o fator precisa ser positivo.' };
            campos.escalaMovimento = esc;
        }
    }
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
