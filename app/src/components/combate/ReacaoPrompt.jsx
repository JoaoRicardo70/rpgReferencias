import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { opcoesDeReacao, getRotuloEfeito } from '../../core/reacoes';
import { getAcoesExibicao, alternarAcao } from '../../core/acoes';

// ↩️ Aviso de Reação: quando um ataque (Acerto no feed) tem VOCÊ como alvo — ou um aliado, se você tem técnica de ajuda —
// pergunta se quer usar suas Reações (core/reacoes.js). Reagir gasta 1 Reação por opção escolhida, avisa no feed e guarda
// em ficha.combate.reacoesPendentes o que entra sozinho no Dano recebido (Defesa > Receber Dano).
// Só olha Acertos NOVOS: com `ts` de depois de este componente montar (o histórico que o feed reenvia ao entrar na mesa
// ou ao recarregar não gera aviso). A folga cobre pequenas diferenças de relógio entre as máquinas.
const FOLGA_RELOGIO_MS = 5 * 1000;

export default function ReacaoPrompt() {
    const feed = useStore(s => s.feedCombate);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const personagens = useStore(s => s.personagens);
    const updateFicha = useStore(s => s.updateFicha);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const vistos = useRef(new Set());
    const montadoEm = useRef(Date.now());
    const [pedido, setPedido] = useState(null);
    const [marcadas, setMarcadas] = useState([]);

    // Procura Acertos novos contra mim (ou contra um aliado) e monta o pedido.
    useEffect(() => {
        if (!meuNome || !Array.isArray(feed) || pedido) return;
        const eu = sanitizarNome(meuNome);
        for (const f of feed) {
            if (!f || f.tipo !== 'acerto' || !f.ts || f.nome === meuNome) continue;
            const chave = `${f.ts}|${f.nome}`;
            if (vistos.current.has(chave)) continue;
            vistos.current.add(chave);
            if (f.ts < montadoEm.current - FOLGA_RELOGIO_MS) continue;

            const alvos = Array.isArray(f.alvosArea) ? f.alvosArea : [];
            const meu = alvos.find(a => a && sanitizarNome(a.nome || '') === eu);
            const aliado = meu ? null : alvos.find(a => a && a.nome && personagens && (personagens[a.nome] || personagens[sanitizarNome(a.nome)]));
            const alvoAtingido = meu || aliado;
            if (!alvoAtingido) continue;

            const contexto = { acertou: !!alvoAtingido.acertou, alvoEhAliado: !meu };
            const opcoes = opcoesDeReacao(minhaFicha, contexto);
            if (opcoes.length === 0) continue;

            const reacoesRestantes = getAcoesExibicao(minhaFicha).reacao.atual;
            if (reacoesRestantes <= 0) {
                adicionarAviso(`${f.nome} atacou ${meu ? 'você' : alvoAtingido.nome}, mas você não tem mais Reações.`, 'alerta');
                continue;
            }
            setMarcadas([]);
            setPedido({ atacante: f.nome, acertou: contexto.acertou, alvoNome: alvoAtingido.nome, alvoEhAliado: contexto.alvoEhAliado, opcoes, restantes: reacoesRestantes });
            break;
        }
    }, [feed, meuNome, minhaFicha, personagens, adicionarAviso, pedido]);

    const alternarMarca = useCallback((id) => {
        setMarcadas(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    }, []);

    const recusar = useCallback(() => { setPedido(null); setMarcadas([]); }, []);

    const reagir = useCallback(() => {
        if (!pedido) return;
        const escolhidas = pedido.opcoes.filter(o => marcadas.includes(o.id)).slice(0, pedido.restantes);
        if (escolhidas.length === 0) { setPedido(null); return; }

        updateFicha((ficha) => {
            escolhidas.forEach(() => alternarAcao(ficha, 'reacao', true));
            if (!ficha.combate) ficha.combate = {};
            if (!Array.isArray(ficha.combate.reacoesPendentes)) ficha.combate.reacoesPendentes = [];
            escolhidas.forEach(o => {
                if (o.efeito === 'reduzir_dano' || o.efeito === 'atacar_ataque') {
                    ficha.combate.reacoesPendentes.push({ id: o.id, nome: o.nome, efeito: o.efeito, valor: o.valor, atacante: pedido.atacante, criadoEm: Date.now() });
                }
            });
        });
        salvarFichaSilencioso();

        const descricao = escolhidas.map(o => `${o.nome} (${getRotuloEfeito(o.efeito)}${o.efeito === 'reduzir_dano' ? ` ${o.valor}%` : o.efeito === 'aumentar_ca' ? ` +${o.valor}` : ''})`).join(', ');
        enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto: `↩️ ${meuNome} usou ${escolhidas.length > 1 ? `${escolhidas.length} Reações` : 'Reação'} contra o ataque de ${pedido.atacante}${pedido.alvoEhAliado ? ` em ${pedido.alvoNome}` : ''}: ${descricao}`, ts: Date.now() });

        const restam = Math.max(0, pedido.restantes - escolhidas.length);
        adicionarAviso(`Gastou ${escolhidas.length} ${escolhidas.length > 1 ? 'Reações' : 'Reação'} (restam ${restam}).`, 'info');
        if (restam === 0) adicionarAviso('Suas Reações acabaram.', 'alerta');
        if (escolhidas.some(o => o.efeito === 'atacar_ataque')) adicionarAviso('Role o seu Dano (aba Ataque ou Livro de Combate): ele será comparado ao Dano que você receberia.', 'info');
        if (escolhidas.some(o => o.efeito === 'contra_ataque' || o.efeito === 'atacar_atacante')) adicionarAviso(`Role seu ataque contra ${pedido.atacante} (a Reação já foi gasta).`, 'info');
        setPedido(null);
        setMarcadas([]);
    }, [pedido, marcadas, updateFicha, meuNome, adicionarAviso]);

    const rotuloGatilho = useMemo(() => {
        if (!pedido) return '';
        if (pedido.alvoEhAliado) return `${pedido.atacante} atacou ${pedido.alvoNome}.`;
        return `${pedido.atacante} atacou você e ${pedido.acertou ? 'ACERTOU' : 'ERROU'}.`;
    }, [pedido]);

    if (!pedido || typeof document === 'undefined' || !document.body) return null;

    return createPortal(
        <div className="reacao-fundo" role="dialog" aria-label="Usar Reação">
            <div className="reacao-caixa">
                <h3 className="reacao-titulo">↩️ Usar Reação?</h3>
                <p className="reacao-contexto">{rotuloGatilho} Você tem <strong>{pedido.restantes}</strong> {pedido.restantes > 1 ? 'Reações' : 'Reação'}.</p>
                <div className="reacao-opcoes">
                    {pedido.opcoes.map(o => (
                        <label key={o.id} className={`reacao-opcao${marcadas.includes(o.id) ? ' marcada' : ''}`}>
                            <input type="checkbox" checked={marcadas.includes(o.id)} onChange={() => alternarMarca(o.id)} disabled={!marcadas.includes(o.id) && marcadas.length >= pedido.restantes} />
                            <span className="reacao-opcao-nome">{o.nome}</span>
                            <span className="reacao-opcao-efeito">{o.origem === 'universal' ? 'Rola seu Dano contra o Dano recebido: se passar, você não toma nada; senão, só a diferença.' : `${getRotuloEfeito(o.efeito)}${o.efeito === 'reduzir_dano' ? ` ${o.valor}%` : o.efeito === 'aumentar_ca' ? ` +${o.valor}` : ''}`}</span>
                        </label>
                    ))}
                </div>
                <div className="reacao-botoes">
                    <button type="button" className="reacao-reagir" onClick={reagir} disabled={marcadas.length === 0}>↩️ REAGIR{marcadas.length > 0 ? ` (${marcadas.length})` : ''}</button>
                    <button type="button" className="reacao-recusar" onClick={recusar}>Não reagir</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
