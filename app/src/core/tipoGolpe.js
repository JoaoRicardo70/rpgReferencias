// ==========================================
// 🏹 TIPO DO GOLPE — "projetil" (golpe à distância) ou "golpe" (corpo a corpo), para a Redução de Dano por tipo de ataque
// (core/reducaoDano.js: alvo `tipo:projetil` / `tipo:golpe`, ex.: "Escudo contra Projéteis", "Proteção contra Golpes").
// Derivado da ficha de QUEM ATACA: arma equipada de distância (core/classesMecanicas.js > getCategoriaArma) ou alcance declarado maior que 1
// quadrado (core/alcance.js > getAlcanceMaximo) = projetil; senão golpe. Sem informação nenhuma o tipo é '' e a redução por tipo NÃO vale.
// ==========================================
import { getCategoriaArma } from './classesMecanicas.js';
import { getAlcanceMaximo } from './alcance.js';

export const TIPO_GOLPE_PROJETIL = 'projetil';
export const TIPO_GOLPE_CORPO = 'golpe';
export const TIPOS_GOLPE = [TIPO_GOLPE_CORPO, TIPO_GOLPE_PROJETIL];

// 'projetil' | 'golpe' | '' (sem ficha). Aceita também um valor já pronto (devolve normalizado).
export function normalizarTipoGolpe(valor) {
    const t = String(valor ?? '').trim().toLowerCase();
    return TIPOS_GOLPE.includes(t) ? t : '';
}

export function tipoDoGolpeDaFicha(ficha) {
    if (!ficha || typeof ficha !== 'object') return '';
    const armas = (ficha.inventario || []).filter(i => i && i.equipado && i.tipo === 'arma');
    if (armas.some(a => getCategoriaArma(a.armaTipo) === 'distancia')) return TIPO_GOLPE_PROJETIL;
    return getAlcanceMaximo(ficha, { padrao: 1 }) > 1 ? TIPO_GOLPE_PROJETIL : TIPO_GOLPE_CORPO;
}
