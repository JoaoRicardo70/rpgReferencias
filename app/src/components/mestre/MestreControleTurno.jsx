import React, { useCallback, useState } from 'react';
import useStore from '../../stores/useStore';

// ⏭️ CONTROLE DE TURNO NA ABA MESTRE: mostra a ordem de iniciativa da cena exibida no Mapa e passa
// o turno sem trocar de aba. Não tem lógica própria de turno — chama a MESMA função avancarTurno
// do Mapa (registrada na store pelo MapaFormProvider, ver resumoTurnoMapa/acaoAvancarTurnoMapa em
// useStore.js), então Ações, Fadiga, Regeneração e Zonas continuam sendo aplicadas exatamente
// como no botão "Passar Turno" do Mapa.
//
// 🔀 Ordem manual (pedido do usuário): o Mestre/Co-Mestre ARRASTA personagens pra dentro da ordem
// (dos cards do Visor de Entidades ou da lista "Adicionar"), reordena arrastando os próprios chips
// e tira da ordem arrastando o chip de volta pro Visor, pra zona "Tirar do turno" ou no ✕. Quem
// grava é o Mapa (acoesOrdemTurnoMapa, MapaFormContext.jsx), no Cenário que já sincroniza pra todos.

export const TIPO_ARRASTO_TURNO = 'application/x-rpg-turno';

// Payload do arrasto em andamento: dataTransfer.getData não é legível durante o dragover em todo
// navegador, então o payload também fica aqui enquanto o arrasto dura.
let arrastoAtual = null;

export function iniciarArrastoTurno(e, payload) {
    arrastoAtual = payload;
    try {
        e.dataTransfer?.setData(TIPO_ARRASTO_TURNO, JSON.stringify(payload));
        e.dataTransfer?.setData('text/plain', payload?.nome || '');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    } catch (err) { /* navegador sem dataTransfer completo: o payload do módulo basta */ }
}

export function lerArrastoTurno(e) {
    if (arrastoAtual) return arrastoAtual;
    try {
        const bruto = e.dataTransfer?.getData(TIPO_ARRASTO_TURNO);
        return bruto ? JSON.parse(bruto) : null;
    } catch (err) { return null; }
}

export function encerrarArrastoTurno() {
    arrastoAtual = null;
}

export default function MestreControleTurno() {
    const resumo = useStore(s => s.resumoTurnoMapa);
    const acaoAvancarTurno = useStore(s => s.acaoAvancarTurnoMapa);
    const acoesOrdem = useStore(s => s.acoesOrdemTurnoMapa);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);

    const [indiceSoltura, setIndiceSoltura] = useState(null);
    const [arrastandoDaOrdem, setArrastandoDaOrdem] = useState(false);
    const [selecaoAdicionar, setSelecaoAdicionar] = useState('');

    const ordem = resumo?.ordem || [];
    const foraDaOrdem = resumo?.foraDaOrdem || [];
    const emCombate = ordem.length > 0;
    const indiceAtual = emCombate ? (Number(resumo?.turnoAtualIndex) || 0) % ordem.length : 0;
    const daVez = emCombate ? ordem[indiceAtual] : null;
    const proximo = emCombate ? ordem[(indiceAtual + 1) % ordem.length] : null;
    const podeEditarOrdem = !!acoesOrdem;

    const passarTurno = useCallback(() => {
        if (typeof acaoAvancarTurno === 'function') acaoAvancarTurno();
    }, [acaoAvancarTurno]);

    const irParaMapa = useCallback(() => setAbaAtiva('aba-mapa'), [setAbaAtiva]);

    const limparArrasto = useCallback(() => {
        encerrarArrastoTurno();
        setIndiceSoltura(null);
        setArrastandoDaOrdem(false);
    }, []);

    // Solta na posição `indice` (0 = antes do primeiro, ordem.length = depois do último).
    const soltarNaOrdem = useCallback((e, indice) => {
        e.preventDefault();
        e.stopPropagation();
        const payload = lerArrastoTurno(e);
        limparArrasto();
        if (!payload || !acoesOrdem) return;
        if (payload.origem === 'ordem') {
            const origem = ordem.findIndex(x => x.chave === payload.chave);
            // Tirando o chip da posição antiga, as posições depois dela andam uma pra trás.
            const destino = origem !== -1 && origem < indice ? indice - 1 : indice;
            acoesOrdem.reordenar(payload.chave, destino);
        } else {
            acoesOrdem.adicionar({ id: payload.id, isDummie: !!payload.isDummie }, indice);
        }
    }, [acoesOrdem, ordem, limparArrasto]);

    const permitirSoltura = (e) => {
        if (!podeEditarOrdem) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };

    // Metade esquerda do chip = antes dele; metade direita = depois.
    const aoPassarSobreChip = (e, i) => {
        permitirSoltura(e);
        const rect = e.currentTarget.getBoundingClientRect?.();
        const depois = rect && rect.width > 0 ? (e.clientX - rect.left) > rect.width / 2 : false;
        const alvo = depois ? i + 1 : i;
        if (alvo !== indiceSoltura) setIndiceSoltura(alvo);
    };

    const soltarParaFora = useCallback((e) => {
        e.preventDefault();
        const payload = lerArrastoTurno(e);
        limparArrasto();
        if (payload?.origem === 'ordem' && acoesOrdem) acoesOrdem.remover({ id: payload.id, isDummie: !!payload.isDummie });
    }, [acoesOrdem, limparArrasto]);

    const adicionarSelecionado = useCallback(() => {
        if (!selecaoAdicionar || !acoesOrdem) return;
        const [tipo, ...resto] = selecaoAdicionar.split(':');
        acoesOrdem.adicionar({ id: resto.join(':'), isDummie: tipo === 'd' }, ordem.length);
        setSelecaoAdicionar('');
    }, [selecaoAdicionar, acoesOrdem, ordem.length]);

    return (
        <div className="mestre-turno">
            <div className="mestre-turno-topo">
                <h3 className="mestre-turno-titulo">⏭️ Controle de Turnos</h3>
                <button
                    className="btn-neon mestre-turno-btn-passar"
                    onClick={passarTurno}
                    disabled={!emCombate || typeof acaoAvancarTurno !== 'function'}
                    title="Passa o turno exatamente como o botão do Mapa (reseta Ações, aplica Fadiga e Regeneração do próximo)"
                >
                    PASSAR TURNO ⏭️
                </button>
            </div>

            {emCombate ? (
                <div className="mestre-turno-status">
                    <span>Vez de: <strong className="mestre-turno-davez">{daVez?.nome}</strong></span>
                    <span className="mestre-turno-proximo">Próximo: {proximo?.nome}</span>
                </div>
            ) : (
                <p className="mestre-turno-vazio">
                    Nenhum combate na cena exibida do Mapa. Arraste personagens do Visor de Entidades para cá, ou defina as iniciativas no{' '}
                    <button className="mestre-turno-link" onClick={irParaMapa}>Mapa</button>.
                </p>
            )}

            {/* 🔀 Zona da ordem: recebe cards do Visor (entrar) e os próprios chips (reordenar) */}
            <div
                className={`mestre-turno-ordem mestre-turno-soltura${indiceSoltura !== null ? ' ativa' : ''}`}
                data-testid="mestre-turno-ordem"
                onDragOver={(e) => { permitirSoltura(e); if (e.target === e.currentTarget && indiceSoltura !== ordem.length) setIndiceSoltura(ordem.length); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIndiceSoltura(null); }}
                onDrop={(e) => soltarNaOrdem(e, indiceSoltura ?? ordem.length)}
            >
                {ordem.map((e, i) => (
                    <React.Fragment key={e.chave || `${e.isDummie ? 'd' : 'p'}-${e.id}`}>
                        {indiceSoltura === i && <span className="mestre-turno-marcador" />}
                        <span
                            className={`mestre-turno-chip${i === indiceAtual ? ' ativo' : ''}${e.isDummie ? ' dummie' : ''}${podeEditarOrdem ? ' arrastavel' : ''}`}
                            title={podeEditarOrdem ? `Iniciativa ${e.iniciativa} — arraste para reordenar, ou para o Visor para tirar do turno` : `Iniciativa ${e.iniciativa}`}
                            draggable={podeEditarOrdem}
                            onDragStart={(ev) => { iniciarArrastoTurno(ev, { origem: 'ordem', chave: e.chave, id: e.id, isDummie: e.isDummie, nome: e.nome }); setArrastandoDaOrdem(true); }}
                            onDragEnd={limparArrasto}
                            onDragOver={(ev) => aoPassarSobreChip(ev, i)}
                        >
                            {e.isDummie ? '👾 ' : ''}{e.nome} <small>({e.iniciativa})</small>
                            {podeEditarOrdem && (
                                <button type="button" className="mestre-turno-chip-remover" title={`Tirar ${e.nome} da ordem de turno`}
                                    onClick={() => acoesOrdem.remover({ id: e.id, isDummie: e.isDummie })}>✕</button>
                            )}
                        </span>
                    </React.Fragment>
                ))}
                {indiceSoltura === ordem.length && <span className="mestre-turno-marcador" />}
                {!emCombate && podeEditarOrdem && <span className="mestre-turno-soltura-dica">⬇️ Solte aqui para colocar na ordem de turno</span>}
            </div>

            {arrastandoDaOrdem && (
                <div className="mestre-turno-remover-zona" onDragOver={permitirSoltura} onDrop={soltarParaFora}>
                    🚪 Solte aqui para tirar do turno
                </div>
            )}

            {podeEditarOrdem && foraDaOrdem.length > 0 && (
                <div className="mestre-turno-adicionar">
                    <select className="input-neon mestre-turno-adicionar-select" value={selecaoAdicionar} onChange={(e) => setSelecaoAdicionar(e.target.value)} aria-label="Personagem para adicionar à ordem de turno">
                        <option value="">➕ Adicionar à ordem de turno...</option>
                        {foraDaOrdem.map(e => (
                            <option key={`${e.isDummie ? 'd' : 'p'}:${e.id}`} value={`${e.isDummie ? 'd' : 'p'}:${e.id}`}>{e.isDummie ? '👾 ' : ''}{e.nome}</option>
                        ))}
                    </select>
                    <button type="button" className="btn-neon mestre-turno-adicionar-btn" onClick={adicionarSelecionado} disabled={!selecaoAdicionar}>Adicionar</button>
                </div>
            )}
        </div>
    );
}
