import { useCallback } from 'react';
import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso } from '../services/firebase-sync';
import { CAMPO_FICHA_POR_TIPO, TIPOS_PEDIDO_JOGADOR, anexarNaLista, normalizarProposta } from '../core/sextaFeiraCriacao';
import { anexarNaFicha, enviarPendente, registrarDecisao, reivindicarPendente } from '../services/sextaFeiraDados';

// 🛠️ PEDIDOS DE CRIAÇÃO DOS JOGADORES (Sexta-Feira): gravar na ficha, aprovar e recusar.
// Usado pelo painel da Sexta-Feira (AIFormContext) e pela aba do Mestre (notificações + Grimório),
// pra que as duas telas sigam exatamente as mesmas regras.
//
// `dialogos` segue a API de components/ia/DialogosSexta.jsx: { avisar(msg, tipo), confirmar({...}) }.
// Quem já pediu confirmação na própria tela pode passar `{ semConfirmar: true }` ao recusar.
export default function usePedidosCriacao(dialogos) {
    const meuNome = useStore(s => s.meuNome) || 'Desconhecido';
    const mesaId = useStore(s => s.mesaId);
    const isMestre = useStore(s => s.isMestre);
    const updateFicha = useStore(s => s.updateFicha);

    // Anexa poder/magia/item à ficha do alvo: a própria pelo store (com save em debounce), a de
    // outro jogador por transação no banco (não sobrescreve o que o dono acabou de gravar).
    const gravarNaFicha = useCallback(async ({ tipo, objeto, alvo }) => {
        const campo = CAMPO_FICHA_POR_TIPO[tipo];
        if (!campo) throw new Error('Tipo de criação desconhecido.');
        const novo = { ...objeto, id: Date.now() };
        if (sanitizarNome(alvo || '') === sanitizarNome(meuNome || '')) {
            updateFicha((f) => { f[campo] = anexarNaLista(f[campo], novo); });
            salvarFichaSilencioso();
        } else {
            await anexarNaFicha(mesaId, alvo, campo, novo);
        }
    }, [meuNome, mesaId, updateFicha]);

    // Tudo é validado DE NOVO antes de gravar (o pedido veio do banco e qualquer um da mesa
    // consegue escrever lá): o tipo, o objeto, e que o pedido é para a própria ficha de quem
    // pediu, que precisa existir na mesa.
    const validarPedido = useCallback((pedido) => {
        if (!pedido || !TIPOS_PEDIDO_JOGADOR.includes(pedido.tipo)) return { erro: 'Tipo de pedido inválido.' };
        const { objeto, valido } = normalizarProposta(pedido.tipo, pedido.objeto);
        if (!valido) return { erro: 'O conteúdo do pedido é inválido.' };
        const alvo = String(pedido.alvo || '');
        if (!alvo || sanitizarNome(alvo) !== sanitizarNome(pedido.solicitante || '')) return { erro: 'O pedido não é para a ficha de quem pediu.' };
        const loja = useStore.getState();
        const existe = sanitizarNome(alvo) === sanitizarNome(loja.meuNome || '')
            || Object.keys(loja.personagens || {}).some(n => sanitizarNome(n) === sanitizarNome(alvo));
        if (!existe) return { erro: `O personagem "${alvo}" não existe nesta mesa.` };
        return { objeto, alvo };
    }, []);

    const aprovarPendente = useCallback(async (id) => {
        if (!isMestre) return false;
        const previa = validarPedido(useStore.getState().sextaFeiraPendentes?.[id]);
        if (previa.erro) { dialogos.avisar(`${previa.erro} Recuse o pedido.`, 'erro'); return false; }
        // Pega o pedido da fila de forma atômica: dois Mestres não aprovam o mesmo pedido.
        let pedido;
        try {
            pedido = await reivindicarPendente(mesaId, id);
        } catch (err) {
            dialogos.avisar(`Não foi possível aprovar: ${err?.message || 'erro de conexão'}.`, 'erro');
            return false;
        }
        if (!pedido) { dialogos.avisar('Este pedido já foi tratado.', 'erro'); return false; }
        const { objeto, alvo, erro } = validarPedido(pedido);
        if (erro) {
            Promise.resolve(enviarPendente(mesaId, pedido)).catch(() => {});
            dialogos.avisar(erro, 'erro');
            return false;
        }
        try {
            await gravarNaFicha({ tipo: pedido.tipo, objeto, alvo });
        } catch (err) {
            // Não gravou: devolve o pedido pra fila, pra não sumir.
            Promise.resolve(enviarPendente(mesaId, pedido)).catch(() => {});
            dialogos.avisar(`Não foi possível aprovar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
        Promise.resolve(registrarDecisao(mesaId, { solicitante: pedido.solicitante, nomeCriacao: objeto.nome, tipo: pedido.tipo, aprovado: true })).catch(() => {});
        dialogos.avisar(`✅ "${objeto.nome}" aprovado e adicionado a ${alvo}.`);
        return true;
    }, [isMestre, mesaId, gravarNaFicha, dialogos, validarPedido]);

    const recusarPendente = useCallback(async (id, { semConfirmar = false } = {}) => {
        const pedido = useStore.getState().sextaFeiraPendentes?.[id];
        if (!isMestre || !pedido) return false;
        if (!semConfirmar) {
            const ok = await dialogos.confirmar({ titulo: '❌ Recusar pedido', mensagem: `Recusar "${pedido.objeto?.nome || 'pedido'}" de ${pedido.solicitante}?`, textoConfirmar: 'Recusar', perigo: true });
            if (!ok) return false;
        }
        try {
            if (!(await reivindicarPendente(mesaId, id))) { dialogos.avisar('Este pedido já foi tratado.', 'erro'); return false; }
            Promise.resolve(registrarDecisao(mesaId, { solicitante: pedido.solicitante, nomeCriacao: pedido.objeto?.nome, tipo: pedido.tipo, aprovado: false })).catch(() => {});
            return true;
        } catch (err) {
            dialogos.avisar(`Não foi possível recusar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
    }, [isMestre, mesaId, dialogos]);

    return { gravarNaFicha, validarPedido, aprovarPendente, recusarPendente };
}
