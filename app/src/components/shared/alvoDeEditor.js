// Onde os editores compartilhados (EstadosGolpeEditor, SuporteEditor) leem e gravam: um item de uma lista da ficha
// (poderes / ataquesElementais / inventario) ou, para a Arma Espiritual, o bloco de um estado dela
// (ficha.armaEspiritual.efeitosEstados[estado], ver core/armaEspiritualEfeitos.js).
export const ROTULO_ESTADO_ARMA = { base: 'Base', verdadeira: 'Forma Verdadeira', fantasma: 'Fantasma Nobre' };

// Leitura (não cria nada). Devolve null se não achar.
export function lerAlvoDeEditor(ficha, colecao, itemId, estado) {
    if (!ficha) return null;
    if (colecao === 'armaEspiritual') {
        const arma = ficha.armaEspiritual;
        if (!arma) return null;
        const bloco = (arma.efeitosEstados && arma.efeitosEstados[estado]) || {};
        return { ...bloco, id: `arma_${estado}`, nome: `${arma.nome || 'Arma Espiritual'} (${ROTULO_ESTADO_ARMA[estado] || estado})`, tipo: 'arma_espiritual' };
    }
    return (ficha[colecao] || []).find(i => i && String(i.id) === String(itemId)) || null;
}

// Escrita (dentro de updateFicha): devolve o objeto mutável, criando o bloco da arma se preciso.
export function acharAlvoParaGravar(f, colecao, itemId, estado) {
    if (colecao === 'armaEspiritual') {
        if (!f.armaEspiritual) f.armaEspiritual = {};
        if (!f.armaEspiritual.efeitosEstados) f.armaEspiritual.efeitosEstados = {};
        if (!f.armaEspiritual.efeitosEstados[estado]) f.armaEspiritual.efeitosEstados[estado] = {};
        return f.armaEspiritual.efeitosEstados[estado];
    }
    return (f[colecao] || []).find(i => i && String(i.id) === String(itemId)) || null;
}
