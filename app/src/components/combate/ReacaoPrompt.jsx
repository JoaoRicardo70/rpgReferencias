import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso, salvarFirebaseImediato } from '../../services/firebase-sync';
import { opcoesDeReacao, getRotuloEfeito } from '../../core/reacoes';
import { getAcoesExibicao, alternarAcao } from '../../core/acoes';
import { relacaoEntre } from '../../core/lados';
import { chaveDoGolpe, dadosParaRerolar, rolarDeflexao, resolverAtacanteParaDeflexao, registrarDeflexao, deflexoesPendentes, consumirDeflexaoPendente, acharDanoDoGolpe, deflexoesExpiradas, expirarDeflexao } from '../../core/deflexao';
import { aplicarDanoDeflexao } from '../../services/deflexao';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { useAtorDosAvisos } from './AvisosDoAtor';

// ↩️ Aviso de Reação: quando um ataque (Acerto no feed) tem VOCÊ como alvo — ou um aliado, se você tem técnica de ajuda —
// pergunta se quer usar suas Reações (core/reacoes.js). Reagir gasta 1 Reação por opção escolhida, avisa no feed e guarda
// em ficha.combate.reacoesPendentes o que entra sozinho no Dano recebido (Defesa > Receber Dano).
// Só olha Acertos NOVOS: com `ts` de depois de este componente montar (o histórico que o feed reenvia ao entrar na mesa
// ou ao recarregar não gera aviso). A folga cobre pequenas diferenças de relógio entre as máquinas.
const FOLGA_RELOGIO_MS = 5 * 1000;

export default function ReacaoPrompt() {
    const feed = useStore(s => s.feedCombate);
    const meuNome = useStore(s => s.meuNome);
    // 🎭 Ficha ativa: a do NPC em que o Mestre está atuando (AvisosDoAtor) ou a minha. A Deflexão e os efeitos abaixo que mexem
    // na PRÓPRIA ficha usam sempre a minha de verdade (minhaFichaReal).
    const { ficha: minhaFicha, updateFicha } = useFichaAtiva();
    const salvarAtivo = useCallSaveAtivo();
    const { nomeFeed, ehAtor } = useAtorDosAvisos();
    const minhaFichaReal = useStore(s => s.minhaFicha);
    const updateFichaReal = useStore(s => s.updateFicha);
    const personagens = useStore(s => s.personagens);
    const cenario = useStore(s => s.cenario);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const vistos = useRef(new Set());
    const deflexoesProcessando = useRef(new Set());
    const montadoEm = useRef(Date.now());
    const [pedido, setPedido] = useState(null);
    const [marcadas, setMarcadas] = useState([]);

    // Procura Acertos novos contra mim (ou contra um aliado) e monta o pedido.
    useEffect(() => {
        if (!meuNome || !nomeFeed || !minhaFicha || !Array.isArray(feed) || pedido) return;
        const eu = sanitizarNome(nomeFeed);
        // Aliado = personagem com relação 'aliada' comigo (core/lados.js); sem equipes configuradas, todo jogador é aliado (como sempre).
        const ehPersonagemAliado = (f) => !!f && relacaoEntre(cenario, minhaFicha, f) === 'aliada';
        for (const f of feed) {
            if (!f || f.tipo !== 'acerto' || !f.ts || f.nome === nomeFeed) continue;
            const chave = `${f.ts}|${f.nome}`;
            if (vistos.current.has(chave)) continue;
            vistos.current.add(chave);
            if (f.ts < montadoEm.current - FOLGA_RELOGIO_MS) continue;

            const alvos = Array.isArray(f.alvosArea) ? f.alvosArea : [];
            const meu = alvos.find(a => a && sanitizarNome(a.nome || '') === eu);
            const aliado = meu ? null : alvos.find(a => a && a.nome && personagens && ehPersonagemAliado(personagens[a.nome] || personagens[sanitizarNome(a.nome)]));
            const alvoAtingido = meu || aliado;
            if (!alvoAtingido) continue;

            const contexto = { acertou: !!alvoAtingido.acertou, alvoEhAliado: !meu };
            // A Deflexão fica só para jogadores: o aviso dela é processado na ficha própria (efeito abaixo).
            const opcoes = opcoesDeReacao(minhaFicha, contexto).filter(o => !(ehAtor && o.efeito === 'rerolar_ataque'));
            if (opcoes.length === 0) continue;

            const reacoesRestantes = getAcoesExibicao(minhaFicha).reacao.atual;
            if (reacoesRestantes <= 0) {
                adicionarAviso(`${f.nome} atacou ${meu ? (ehAtor ? nomeFeed : 'você') : alvoAtingido.nome}, mas ${ehAtor ? nomeFeed : 'você'} não tem mais Reações.`, 'alerta');
                continue;
            }
            setMarcadas([]);
            setPedido({ golpe: { chave: chaveDoGolpe(f), ts: f.ts, dados: dadosParaRerolar(f) }, atacante: f.nome, acertou: contexto.acertou, alvoNome: alvoAtingido.nome, alvoEhAliado: contexto.alvoEhAliado, opcoes, restantes: reacoesRestantes });
            break;
        }
    }, [feed, meuNome, nomeFeed, ehAtor, minhaFicha, personagens, cenario, adicionarAviso, pedido]);

    // 🔁 Deflexão que acertou (core/deflexao.js): quando o atacante rola o Dano do golpe, devolve esse dano a ele (só o cliente do defensor grava).
    useEffect(() => {
        if (!meuNome || !minhaFichaReal || !Array.isArray(feed)) return;
        deflexoesPendentes(minhaFichaReal).forEach((d) => {
            if (deflexoesProcessando.current.has(d.chave)) return;
            const golpeDano = acharDanoDoGolpe(feed, d);
            if (!golpeDano) return;
            deflexoesProcessando.current.add(d.chave);
            let consumiu = false;
            updateFichaReal((ficha) => { consumiu = consumirDeflexaoPendente(ficha, d.chave); });
            if (!consumiu) return;
            // At-most-once: grava o estado `aplicada` no Firebase ANTES de aplicar o dano (F5/outra aba não reaplicam). Limitação residual: duas abas abertas
            // que consumam antes de o Firebase sincronizar podem aplicar duas vezes; se a aba cair entre gravar e aplicar, o dano daquela Deflexão se perde.
            Promise.resolve(salvarFirebaseImediato()).catch(() => {}).then(() => {
                const st = useStore.getState();
                const r = aplicarDanoDeflexao({ atacante: d.atacante, dano: golpeDano.dano, elemento: golpeDano.elemento, personagens: st.personagens, dummies: st.dummies, divisorPoderMesa: st.divisorPoderMesa });
                const texto = r.ok
                    ? `🔁 Deflexão de ${meuNome}: o golpe voltou e ${d.atacante} recebeu ${Math.floor(r.final).toLocaleString('pt-BR')} de dano.`
                    : `🔁 Deflexão de ${meuNome} acertou, mas ${r.motivo} (dano do golpe: ${Math.floor(Number(golpeDano.dano) || 0).toLocaleString('pt-BR')}; peça ao Mestre para aplicar).`;
                enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto, ts: Date.now() });
                if (r.ok && r.textos && r.textos.length > 0) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔔 ${d.atacante}: ${r.textos.join(' · ')}`, ts: Date.now() });
            });
        });
    }, [feed, minhaFichaReal, meuNome, updateFichaReal]);

    // 🔁 Deflexão que acertou mas venceu sem o Dano do golpe: avisa (a Reação já tinha sido gasta). Confere a cada 30 s e ao mudar a ficha.
    useEffect(() => {
        if (!meuNome) return undefined;
        const conferir = () => {
            const ficha = useStore.getState?.()?.minhaFicha;
            deflexoesExpiradas(ficha).forEach((d) => {
                let expirou = false;
                updateFichaReal((f) => { expirou = expirarDeflexao(f, d.chave); });
                if (!expirou) return;
                salvarFichaSilencioso();
                adicionarAviso(`A Deflexão contra ${d.atacante} acertou, mas ele não rolou o Dano daquele golpe a tempo: nada foi devolvido (a Reação foi gasta).`, 'alerta');
            });
        };
        conferir();
        const t = setInterval(conferir, 30000);
        return () => clearInterval(t);
    }, [meuNome, minhaFichaReal, updateFichaReal, adicionarAviso]);

    const alternarMarca = useCallback((id) => {
        setMarcadas(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    }, []);

    const recusar = useCallback(() => { setPedido(null); setMarcadas([]); }, []);

    const reagir = useCallback(() => {
        if (!pedido) return;
        let escolhidas = pedido.opcoes.filter(o => marcadas.includes(o.id)).slice(0, pedido.restantes);
        // 🔁 Deflexão (core/deflexao.js): uma só por golpe; falha fechada (sem dados do golpe, atacante ausente ou sem CA) NÃO gasta a Reação.
        let rolagemDeflexao = null;
        const querDeflexao = escolhidas.filter(o => o.efeito === 'rerolar_ataque');
        if (querDeflexao.length > 0) {
            const st = useStore.getState();
            const golpe = pedido.golpe;
            const atac = golpe && golpe.dados && golpe.chave ? resolverAtacanteParaDeflexao(pedido.atacante, { personagens: st.personagens, dummies: st.dummies, divisorPoderMesa: st.divisorPoderMesa }) : null;
            if (!atac) adicionarAviso(!golpe || !golpe.dados ? 'Este golpe não trouxe o bônus de acerto no Feed (versão antiga): a Deflexão não pode re-rolar.' : `Não consegui a CA de ${pedido.atacante} (ausente da mesa ou sem CA válida): a Deflexão não foi usada e a Reação não foi gasta.`, 'alerta');
            else rolagemDeflexao = { chave: golpe.chave, golpeTs: golpe.ts, atacante: pedido.atacante, roll: rolarDeflexao({ ...golpe.dados, defesa: atac.defesa }) };
            let jaTem = false;
            escolhidas = escolhidas.filter(o => { if (o.efeito !== 'rerolar_ataque') return true; if (!rolagemDeflexao || jaTem) return false; jaTem = true; return true; });
        }
        if (escolhidas.length === 0) { setPedido(null); return; }

        let deflexaoRegistrada = false;
        updateFicha((ficha) => {
            // Cada Reação gasta é 1 ação; a Deflexão repetida no mesmo golpe (outra aba/clique) é recusada aqui e não gasta nada.
            escolhidas.forEach((o) => {
                if (o.efeito === 'rerolar_ataque') {
                    if (registrarDeflexao(ficha, { chave: rolagemDeflexao.chave, atacante: rolagemDeflexao.atacante, acertou: rolagemDeflexao.roll.acertou, golpeTs: rolagemDeflexao.golpeTs })) { alternarAcao(ficha, 'reacao', true); deflexaoRegistrada = true; }
                } else alternarAcao(ficha, 'reacao', true);
            });
            if (!ficha.combate) ficha.combate = {};
            if (!Array.isArray(ficha.combate.reacoesPendentes)) ficha.combate.reacoesPendentes = [];
            escolhidas.forEach(o => {
                if (o.efeito === 'reduzir_dano' || o.efeito === 'atacar_ataque') {
                    ficha.combate.reacoesPendentes.push({ id: o.id, nome: o.nome, efeito: o.efeito, valor: o.valor, atacante: pedido.atacante, criadoEm: Date.now() });
                }
            });
        });
        salvarAtivo();

        if (rolagemDeflexao && !deflexaoRegistrada) {
            adicionarAviso('Você já usou a Deflexão neste golpe.', 'alerta');
            escolhidas = escolhidas.filter(o => o.efeito !== 'rerolar_ataque');
            if (escolhidas.length === 0) { setPedido(null); setMarcadas([]); return; }
        }
        if (deflexaoRegistrada) {
            const r = rolagemDeflexao.roll;
            enviarParaFeed({ tipo: 'sistema', nome: nomeFeed, texto: `🔁 Deflexão de ${nomeFeed}: re-rolou o ataque de ${pedido.atacante} contra a defesa do próprio atacante (${r.soma} + bônus = ${r.total}${r.natural === 20 ? ', 20 natural' : r.natural === 1 ? ', 1 natural' : ''}): ${r.acertou ? 'ACERTOU' : 'ERROU'}.`, ts: Date.now() });
            adicionarAviso('A Deflexão re-rola o ataque como um ataque simples (sem vantagem nem Diferença de Poder).', 'info');
            adicionarAviso(r.acertou ? `A Deflexão acertou! O dano do golpe volta a ${pedido.atacante} quando ele rolar o Dano (até 10 min).` : 'A Deflexão errou.', r.acertou ? 'info' : 'alerta');
        }
        const descricao = escolhidas.map(o => `${o.nome} (${getRotuloEfeito(o.efeito)}${o.efeito === 'reduzir_dano' ? ` ${o.valor}%` : o.efeito === 'aumentar_ca' ? ` +${o.valor}` : ''})`).join(', ');
        enviarParaFeed({ tipo: 'sistema', nome: nomeFeed, texto: `↩️ ${nomeFeed} usou ${escolhidas.length > 1 ? `${escolhidas.length} Reações` : 'Reação'} contra o ataque de ${pedido.atacante}${pedido.alvoEhAliado ? ` em ${pedido.alvoNome}` : ''}: ${descricao}`, ts: Date.now() });

        const restam = Math.max(0, pedido.restantes - escolhidas.length);
        adicionarAviso(`Gastou ${escolhidas.length} ${escolhidas.length > 1 ? 'Reações' : 'Reação'} (restam ${restam}).`, 'info');
        if (restam === 0) adicionarAviso('Suas Reações acabaram.', 'alerta');
        if (escolhidas.some(o => o.efeito === 'atacar_ataque')) adicionarAviso('Role o seu Dano (aba Ataque ou Livro de Combate): ele será comparado ao Dano que você receberia.', 'info');
        if (escolhidas.some(o => o.efeito === 'contra_ataque' || o.efeito === 'atacar_atacante')) adicionarAviso(`Role seu ataque contra ${pedido.atacante} (a Reação já foi gasta).`, 'info');
        setPedido(null);
        setMarcadas([]);
    }, [pedido, marcadas, updateFicha, salvarAtivo, nomeFeed, adicionarAviso]);

    const rotuloGatilho = useMemo(() => {
        if (!pedido) return '';
        if (pedido.alvoEhAliado) return `${pedido.atacante} atacou ${pedido.alvoNome}.`;
        return `${pedido.atacante} atacou ${ehAtor ? nomeFeed : 'você'} e ${pedido.acertou ? 'ACERTOU' : 'ERROU'}.`;
    }, [pedido, ehAtor, nomeFeed]);

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
