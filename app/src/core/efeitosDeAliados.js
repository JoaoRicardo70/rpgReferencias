// ==========================================
// 🤝 EFEITOS QUE VALEM PARA OS ALIADOS DO PORTADOR — o menor mecanismo para "todos os aliados ganham X contra o alvo marcado com a Presa".
//   Um efeito de Poder (ativo/passivo) marcado `valeParaAliados: true` também vale para quem é ALIADO do portador e está na CENA ATIVA
//   (core/aliadosEmCampo.js: conscientes ou não). Ele é avaliado no contexto de QUEM ATACA (o BENEFICIÁRIO = a ficha passada a efeitosDeAliados):
//   `quando: 'alvo_com_estado:presa'` olha o alvo do beneficiário, `escalaContador` usa os contadores de QUEM TEM o efeito (o portador do Poder) e
//   `escalaAliados` conta os aliados de quem tem o efeito (o beneficiário entra nessa conta como aliado dele, o próprio dono não).
//   O beneficiário NUNCA lê o próprio Poder por aqui (é excluído da lista de aliados): o efeito dele entra uma vez só, pelo caminho normal.
//   Identidade: `nomePortador` = chave do beneficiário em `personagens` (do chamador, ou pela identidade da ficha); sem ela, [] (falha fechada).
//   Só entram atributos de ATAQUE lidos por core/efeitosCondicionais.js > coletarEfeitos (ATRIBUTOS_PARA_ALIADOS); nos outros a marca é ignorada.
//   O efeito vale só enquanto o Poder do portador está ligado (ativos) ou sempre (passivos). NÃO há evento "morreu": se o portador sair da cena, os
//   aliados deixam de receber (a cena ativa decide). Simplificação: a Presa de QUALQUER portador conta (a Presa é de um único portador).
//   Anti-inflação: no máximo UM efeito por (nome do Poder, atributo) vindo de portadores diferentes (o primeiro na ordem da mesa); a soma dos dados
//   ainda passa por limitarDadosDeEfeitos. Cache de 1 entrada (pela lista de aliados, que já é memoizada por referências da mesa).
//   Não recursivo: lê só os Poderes dos aliados, nunca os efeitos "de aliados" deles.
// ==========================================
import { listarAliadosEmCampoDaMesa, nomeDoPortador } from './aliadosEmCampo.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';

export const ATRIBUTOS_PARA_ALIADOS = ['acerto', 'vantagem', 'piso_d20', 'margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico', 'mult_critico', 'mult_critico_fatal', 'acerto_automatico', 'dano_dados'];

export const efeitoPodeValerParaAliados = (atributo) => ATRIBUTOS_PARA_ALIADOS.includes(String(atributo ?? '').trim().toLowerCase());

let cacheEfeitos = null;

// Os efeitos marcados `valeParaAliados` dos Poderes dos aliados do beneficiário `ficha` na cena ativa ([] sem mesa/aliados/nome). O resultado é compartilhado
// (mesma referência enquanto a mesa não muda): não mute.
export function efeitosDeAliados(ficha, nomePortador = '') {
    if (!ficha || typeof ficha !== 'object') return [];
    const aliados = listarAliadosEmCampoDaMesa(ficha, null, nomeDoPortador(ficha, nomePortador));
    if (aliados.length === 0) return [];
    if (cacheEfeitos && cacheEfeitos.aliados === aliados) return cacheEfeitos.valor;
    const saida = [];
    // Dedup só entre portadores DIFERENTES (mesmo nome de Poder em dois aliados não soma em dobro); dentro do mesmo Poder todos os efeitos valem.
    const vistos = new Set();
    aliados.forEach(({ nome, ficha: aliado, dummie }) => {
        if (dummie || !aliado || !Array.isArray(aliado.poderes)) return;
        aliado.poderes.forEach((p) => {
            if (!p) return;
            const r = resolverEfeitosEntidade(p, aliado, nome);
            const vistosDoPoder = new Set();
            const juntar = (lista) => (lista || []).forEach((e) => {
                if (!e || typeof e !== 'object' || e.valeParaAliados !== true || !efeitoPodeValerParaAliados(e.atributo)) return;
                const chave = `${String(p.nome || p.id).trim().toLowerCase()}|${String(e.atributo).trim().toLowerCase()}`;
                // Já veio de OUTRO portador com o mesmo Poder/atributo: descarta. Do mesmo portador e Poder: mantém.
                if (vistos.has(chave) && !vistosDoPoder.has(chave)) return;
                vistosDoPoder.add(chave);
                vistos.add(chave);
                saida.push(e);
            });
            if (p.ativa) juntar(r.efeitos);
            juntar(r.efeitosPassivos);
        });
    });
    cacheEfeitos = { aliados, valor: saida };
    return saida;
}
