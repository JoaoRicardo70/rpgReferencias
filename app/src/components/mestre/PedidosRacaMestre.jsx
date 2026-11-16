import React, { useCallback, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { aprovarPedidoRaca, recusarPedidoRaca } from '../../services/composicaoRacial';
import { getRacas, listarPedidosRaca, PERCENTUAL_RACA_ADQUIRIDA_PADRAO } from '../../core/racas';

// 🧬 PEDIDOS DE RAÇA (Manipulação de DNA) — só Mestre/Co-Mestre. Lista os pedidos pendentes de todos os personagens
// (quem, qual Raça, motivo, data). Aprovar adiciona a Raça adquirida à composição no percentual inicial escolhido (padrão 10%); Recusar descarta.
const formatarData = (ts) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
};

export default function PedidosRacaMestre() {
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const personagens = useStore(s => s.personagens);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const [percentuais, setPercentuais] = useState({});
    const [mensagem, setMensagem] = useState(null);
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const pedidos = useMemo(() => listarPedidosRaca({ personagens, meuNome, minhaFicha }), [personagens, meuNome, minhaFicha]);

    const valorDe = (id) => (percentuais[id] === undefined ? String(PERCENTUAL_RACA_ADQUIRIDA_PADRAO) : percentuais[id]);
    const aprovar = useCallback((item) => {
        const v = percentuais[item.pedido.id];
        const r = aprovarPedidoRaca({ id: item.id, nome: item.nome, isDummie: false }, item.pedido.id, v === undefined || v === '' ? PERCENTUAL_RACA_ADQUIRIDA_PADRAO : Number(v));
        setMensagem(r.ok ? { ok: true, texto: `Pedido de ${item.nome} aprovado.` } : { ok: false, texto: r.mensagem || 'Não foi possível aprovar.' });
    }, [percentuais]);
    const recusar = useCallback((item) => {
        const r = recusarPedidoRaca({ id: item.id, nome: item.nome, isDummie: false }, item.pedido.id);
        setMensagem(r.ok ? { ok: true, texto: `Pedido de ${item.nome} recusado.` } : { ok: false, texto: r.mensagem || 'Não foi possível recusar.' });
    }, []);

    if (!isMestre) return null;
    return (
        <div className="pedido-raca-painel" role="region" aria-label="Pedidos de Raça">
            <h4 className="equipes-subtitulo">🧬 Pedidos de Raça {pedidos.length > 0 && <span className="pedido-raca-badge" aria-label={`${pedidos.length} pendente(s)`}>{pedidos.length}</span>}</h4>
            <p className="equipes-legenda">Jogadores com um poder de Manipulação de DNA podem pedir Raças novas. Ao aprovar, a Raça entra na composição como adquirida, no percentual inicial que você definir (padrão {PERCENTUAL_RACA_ADQUIRIDA_PADRAO}%).</p>
            {pedidos.length === 0 ? <p className="equipes-vazio">Nenhum pedido pendente.</p> : (
                <ul className="pedido-raca-lista">
                    {pedidos.map((item) => {
                        const raca = racas.find(r => r.id === item.pedido.racaId);
                        const rotuloRaca = raca ? `${raca.icone} ${raca.nome}` : `${item.pedido.racaId} (fora do catálogo)`;
                        return (
                            <li key={`${item.id}:${item.pedido.id}`} className="pedido-raca-item">
                                <div className="pedido-raca-info">
                                    <strong className="pedido-raca-quem">{item.nome}</strong> pede <strong>{rotuloRaca}</strong>
                                    {item.pedido.ts ? <span className="pedido-raca-data"> · {formatarData(item.pedido.ts)}</span> : null}
                                    {item.semPoderDNA && <p className="composicao-mensagem composicao-mensagem--erro" role="note">⚠️ sem poder de Manipulação de DNA</p>}
                                    {item.pedido.motivo ? <p className="pedido-raca-motivo">“{item.pedido.motivo}”</p> : <p className="pedido-raca-motivo">Sem motivo informado.</p>}
                                </div>
                                <label className="pedido-raca-percentual">Percentual inicial
                                    <input type="number" min={0} max={100} step={1} className="input-neon composicao-input-percentual" value={valorDe(item.pedido.id)}
                                        aria-label={`Percentual inicial do pedido de ${item.nome}`}
                                        onChange={(ev) => setPercentuais(p => ({ ...p, [item.pedido.id]: ev.target.value }))} />%
                                </label>
                                <button type="button" className="btn-neon btn-green equipes-btn" onClick={() => aprovar(item)} disabled={item.semPoderDNA} title={item.semPoderDNA ? 'O personagem não tem poder de Manipulação de DNA' : undefined} aria-label={`Aprovar pedido de ${item.nome}: ${raca ? raca.nome : item.pedido.racaId}`}>✔ Aprovar</button>
                                <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => recusar(item)} aria-label={`Recusar pedido de ${item.nome}: ${raca ? raca.nome : item.pedido.racaId}`}>✖ Recusar</button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {mensagem && <p className={`composicao-mensagem${mensagem.ok ? '' : ' composicao-mensagem--erro'}`} role="status">{mensagem.texto}</p>}
        </div>
    );
}
