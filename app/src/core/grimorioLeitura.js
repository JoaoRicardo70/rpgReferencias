// ==========================================
// LIVRO DA ENTIDADE (Sandbox do Mestre) — lógica pura das abas do livro e de onde um pedido da
// Sexta-Feira entra na ficha (components/mestre/LivroEntidade.jsx e MestrePedidosSexta.jsx).
// ==========================================

import { categoriaDoPoderFicha } from './categoriasPoder';
// Botões do topo do livro da entidade, na ordem em que aparecem.
export const ABAS_LIVRO_ENTIDADE = [
    { id: 'ficha', icone: '📕', nome: 'Ficha Definitiva' },
    { id: 'grimorio', icone: '📖', nome: 'Grimório Místico (Poderes & Elementos)' },
];

// Categoria de um poder na aba Poderes Clássicos (sem categoria = 'poder', como lá).
export function categoriaDoPoder(p) {
    // Mesma regra da lista de poderes (core/categoriasPoder.js): sem categoria = 'poder'; desconhecida = 'habilidade'.
    return categoriaDoPoderFicha(p);
}

// Em qual parte da ficha um pedido da Sexta-Feira entra: 'habilidade' | 'poder' | 'forma'
// (Livro dos Poderes), 'magias' (Afinidades & Elementos) ou 'inventario'.
export function abaDoPedido(pedido) {
    if (!pedido) return null;
    if (pedido.tipo === 'poder') return categoriaDoPoder(pedido.objeto);
    if (pedido.tipo === 'magia') return 'magias';
    if (pedido.tipo === 'item') return 'inventario';
    if (pedido.tipo === 'combo' || pedido.tipo === 'followup') return 'combos';
    return null;
}
