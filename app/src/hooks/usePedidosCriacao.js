import { useCallback } from 'react';
import useStore, { sanitizarNome } from '../stores/useStore';
import { salvarFichaSilencioso } from '../services/firebase-sync';
import { CAMPO_FICHA_POR_TIPO, TIPOS_PEDIDO_JOGADOR, anexarNaLista, normalizarProposta } from '../core/sextaFeiraCriacao';
import { aplicarExcecaoRaca, ehHabilidadeDeRaca, racasAcessoPadraoParaFicha } from '../core/racas';
import { verificarAcessoHabilidadeRaca } from '../core/racasAcesso';
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
    // 🧬 Habilidade de Raça (core/racas.js): a IA/jogador nunca define quem tem acesso (o Mestre concede com a Raça cadastrada do alvo). Esta tela usa dialogos.confirmar (diálogo próprio da Sexta-Feira), não o ConfirmarExcecaoRaca. Gravar sem acesso da Raça do alvo
    // só vale com a confirmação explícita do Mestre (exceção, racaExcecao: true); jogador não grava. Devolve { objeto, erro, precisaConfirmarExcecao, mensagem }.
    const decidirAcessoRaca = useCallback((tipo, objeto, alvo, excecaoConfirmada = false) => {
        if (tipo !== 'poder' || !ehHabilidadeDeRaca(objeto)) return { objeto };
        const loja = useStore.getState();
        const chave = sanitizarNome(alvo || '');
        const ficha = chave === sanitizarNome(meuNome || '') ? loja.minhaFicha : (loja.personagens || {})[alvo] || (loja.personagens || {})[chave];
        // A IA/jogador nunca define quem tem acesso: o Mestre concede com a Raça cadastrada do alvo (sem raça cadastrada = [] + exceção).
        const poder = { ...objeto, racasAcesso: isMestre ? racasAcessoPadraoParaFicha(loja.cenario, ficha) : [] };
        delete poder.racaExcecao;
        const r = verificarAcessoHabilidadeRaca({ cenario: loja.cenario, ficha, poder, isMestre });
        if (r.permitido) return { objeto: aplicarExcecaoRaca(poder, false) };
        if (r.precisaConfirmarExcecao && excecaoConfirmada) return { objeto: aplicarExcecaoRaca(poder, true) };
        return { erro: r.mensagem, precisaConfirmarExcecao: r.precisaConfirmarExcecao, mensagem: r.mensagem };
    }, [meuNome, isMestre]);

    const gravarNaFicha = useCallback(async ({ tipo, objeto, alvo, excecaoConfirmada = false }) => {
        const campo = CAMPO_FICHA_POR_TIPO[tipo];
        if (!campo) throw new Error('Tipo de criação desconhecido.');
        const acessoRaca = decidirAcessoRaca(tipo, objeto, alvo, excecaoConfirmada);
        if (acessoRaca.erro) {
            // Mestre aplicando direto: pergunta aqui mesmo; recusar ou jogador = não grava.
            const aceito = acessoRaca.precisaConfirmarExcecao && typeof dialogos?.confirmar === 'function'
                && await dialogos.confirmar({ titulo: '🧬 Raça sem acesso', mensagem: acessoRaca.mensagem, textoConfirmar: 'Conceder como exceção' });
            if (!aceito) throw new Error(acessoRaca.precisaConfirmarExcecao ? 'Concessão de Habilidade de Raça cancelada.' : acessoRaca.erro);
            objeto = decidirAcessoRaca(tipo, objeto, alvo, true).objeto;
        } else {
            objeto = acessoRaca.objeto;
        }
        const novo = { ...objeto, id: Date.now() };
        if (sanitizarNome(alvo || '') === sanitizarNome(meuNome || '')) {
            updateFicha((f) => { f[campo] = anexarNaLista(f[campo], novo); });
            salvarFichaSilencioso();
        } else {
            await anexarNaFicha(mesaId, alvo, campo, novo);
        }
    }, [meuNome, mesaId, updateFicha, decidirAcessoRaca, dialogos]);

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
        const pedidoPrevio = useStore.getState().sextaFeiraPendentes?.[id];
        const previa = validarPedido(pedidoPrevio);
        if (previa.erro) { dialogos.avisar(`${previa.erro} Recuse o pedido.`, 'erro'); return false; }
        // 🧬 Habilidade de Raça sem acesso da Raça do alvo: o Mestre confirma a exceção ANTES de pegar o pedido da fila (recusar aqui não mexe em nada).
        let excecaoConfirmada = false;
        const acessoPrevio = decidirAcessoRaca(pedidoPrevio.tipo, previa.objeto, previa.alvo);
        if (acessoPrevio.erro) {
            if (!acessoPrevio.precisaConfirmarExcecao) { dialogos.avisar(acessoPrevio.erro, 'erro'); return false; }
            const ok = await dialogos.confirmar({ titulo: '🧬 Raça sem acesso', mensagem: acessoPrevio.mensagem, textoConfirmar: 'Conceder como exceção' });
            if (!ok) return false;
            excecaoConfirmada = true;
        }
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
            await gravarNaFicha({ tipo: pedido.tipo, objeto, alvo, excecaoConfirmada });
        } catch (err) {
            // Não gravou: devolve o pedido pra fila, pra não sumir.
            Promise.resolve(enviarPendente(mesaId, pedido)).catch(() => {});
            dialogos.avisar(`Não foi possível aprovar: ${err?.message || 'erro desconhecido'}.`, 'erro');
            return false;
        }
        Promise.resolve(registrarDecisao(mesaId, { solicitante: pedido.solicitante, nomeCriacao: objeto.nome, tipo: pedido.tipo, aprovado: true })).catch(() => {});
        dialogos.avisar(`✅ "${objeto.nome}" aprovado e adicionado a ${alvo}.`);
        return true;
    }, [isMestre, mesaId, gravarNaFicha, dialogos, validarPedido, decidirAcessoRaca]);

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
