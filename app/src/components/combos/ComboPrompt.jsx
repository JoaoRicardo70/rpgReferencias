import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { temCombos, opcoesDeCombo, estadoDeCombo, zerarEstadoDeCombo, rotuloAcaoGolpe, resumirCombo, descreverBuff, ACOES_GOLPE } from '../../core/combos';
import { aplicarEscolhaCombo, acaoFaltando, definirEstadoDeCombo } from './aplicarCombo';

// 🥋 Aviso de Combo (mesmo jeito do aviso de Reação, components/combate/ReacaoPrompt.jsx): quando um golpe SEU acerta, pergunta o que foi:
// o iniciador de um Combo, o próximo golpe do Combo em andamento ou um Follow Up. Só aparece para quem criou Combos; "Foi um golpe comum" ignora.
// Também zera o estado do Combo quando o combate acaba (a iniciativa volta a 0).
// Só olha Acertos NOVOS (com `ts` de depois de este componente montar), como o aviso de Reação.
const FOLGA_RELOGIO_MS = 5 * 1000;

const acertou = (f) => {
    const alvos = Array.isArray(f.alvosArea) ? f.alvosArea : [];
    return alvos.length === 0 || alvos.some(a => a && a.acertou); // sem alvo marcado: o jogador confirma
};

export default function ComboPrompt() {
    const feed = useStore(s => s.feedCombate);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const vistos = useRef(new Set());
    const montadoEm = useRef(Date.now());
    const [pedido, setPedido] = useState(null);
    const [escolhido, setEscolhido] = useState('');
    const [custo, setCusto] = useState('padrao');
    const [gastar, setGastar] = useState(true);

    const opcoes = useMemo(() => (pedido ? opcoesDeCombo(minhaFicha) : null), [pedido, minhaFicha]);

    // Lista plana do que dá para escolher (a ordem é a da tela).
    const itens = useMemo(() => {
        if (!opcoes) return [];
        const lista = [];
        if (opcoes.proximo) lista.push({ id: 'avancar', escolha: { tipo: 'avancar', combo: opcoes.proximo.combo, golpe: opcoes.proximo.golpe }, titulo: `Golpe ${opcoes.proximo.indice + 1} do Combo "${opcoes.proximo.combo.nome}": ${opcoes.proximo.golpe.nome || 'golpe'}`, detalhe: opcoes.proximo.ultimo ? 'Último golpe: conclui o Combo e os buffs ficam no máximo.' : 'Avança o Combo e soma os buffs deste golpe.', buffs: opcoes.proximo.golpe.buffs, acao: opcoes.proximo.golpe.acao, permitidas: [opcoes.proximo.golpe.acao] });
        opcoes.iniciadores.forEach(({ combo, golpe }) => lista.push({ id: `iniciar-${combo.id}`, escolha: { tipo: 'iniciar', combo, golpe }, titulo: `Iniciar o Combo "${combo.nome}" com ${golpe.nome}`, detalhe: resumirCombo(combo), buffs: golpe.buffs, acao: golpe.acao, permitidas: [golpe.acao] }));
        opcoes.followUps.forEach(({ followUp, nivel }) => lista.push({ id: `fu-${followUp.id}`, escolha: { tipo: 'followUp', followUp, golpe: followUp }, titulo: `Follow Up "${followUp.nome}" (nível ${nivel + 1})`, detalhe: followUp.niveis[nivel].descricao || followUp.descricao || 'Pode ser usado fora do turno.', buffs: followUp.niveis[nivel].buffs, acao: followUp.acoesPermitidas[0], permitidas: followUp.acoesPermitidas }));
        return lista;
    }, [opcoes]);

    // Procura Acertos novos meus e monta o pedido (só se a ficha usa Combos e há o que escolher).
    useEffect(() => {
        if (!meuNome || !Array.isArray(feed) || pedido) return;
        const usaCombos = temCombos(minhaFicha);
        for (const f of feed) {
            if (!f || f.tipo !== 'acerto' || !f.ts || f.nome !== meuNome) continue;
            const chave = `${f.ts}|${f.nome}`;
            if (vistos.current.has(chave)) continue;
            vistos.current.add(chave); // vale também sem Combos: um golpe de antes de criar o primeiro Combo não vira aviso depois
            if (!usaCombos || f.ts < montadoEm.current - FOLGA_RELOGIO_MS) continue;
            if (!acertou(f)) {
                if (estadoDeCombo(minhaFicha).ativo) adicionarAviso('O golpe errou. Se o Combo foi quebrado, interrompa na Ficha > Combate > Combos.', 'alerta');
                continue;
            }
            const o = opcoesDeCombo(minhaFicha);
            if (!o.proximo && o.iniciadores.length === 0 && o.followUps.length === 0) continue;
            setEscolhido('');
            setPedido({ ts: f.ts });
            break;
        }
    }, [feed, meuNome, minhaFicha, pedido, adicionarAviso]);

    // Fim do combate (o Mestre zerou a iniciativa): Combos e Follow Ups começam do zero no próximo.
    const iniciativaAnterior = useRef({ nome: meuNome, valor: minhaFicha?.iniciativa });
    useEffect(() => {
        // Só conta a virada da MESMA ficha (trocar de personagem não zera os Combos do outro).
        const antes = iniciativaAnterior.current.nome === meuNome ? Number(iniciativaAnterior.current.valor) || 0 : 0;
        const agora = Number(minhaFicha?.iniciativa) || 0;
        iniciativaAnterior.current = { nome: meuNome, valor: minhaFicha?.iniciativa };
        if (antes > 0 && agora === 0 && JSON.stringify(estadoDeCombo(minhaFicha)) !== JSON.stringify(zerarEstadoDeCombo())) {
            updateFicha((f) => { definirEstadoDeCombo(f, zerarEstadoDeCombo()); });
            salvarFichaSilencioso();
            adicionarAviso('Combate encerrado: Combos zerados.', 'info');
        }
    }, [minhaFicha, meuNome, updateFicha, adicionarAviso]);

    const item = itens.find(i => i.id === escolhido) || null;
    const escolher = useCallback((i) => { setEscolhido(i.id); setCusto(i.acao); setGastar(true); }, []);
    const recusar = useCallback(() => { setPedido(null); setEscolhido(''); }, []);

    const confirmar = useCallback(() => {
        if (!item) return;
        const escolha = { ...item.escolha, custo };
        const falta = gastar ? acaoFaltando(minhaFicha, custo) : [];
        if (falta.length > 0 && !window.confirm(`Sem ${falta.join(' e ')} disponível. Usar mesmo assim?`)) return;
        let texto = '';
        updateFicha((f) => { texto = aplicarEscolhaCombo(f, escolha, { gastar }); });
        salvarFichaSilencioso();
        if (texto) enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto });
        adicionarAviso(gastar ? `Combo registrado (gastou 1 ${rotuloAcaoGolpe(custo)}).` : 'Combo registrado.', 'info');
        setPedido(null);
        setEscolhido('');
    }, [item, custo, gastar, minhaFicha, updateFicha, meuNome, adicionarAviso]);

    if (!pedido || typeof document === 'undefined' || !document.body) return null;

    return createPortal(
        <div className="reacao-fundo" role="dialog" aria-label="Combo e Follow Up">
            <div className="reacao-caixa">
                <h3 className="reacao-titulo">🥋 Seu golpe acertou!</h3>
                <p className="reacao-contexto">O que foi esse golpe?</p>
                <div className="reacao-opcoes">
                    {itens.map(i => (
                        <label key={i.id} className={`reacao-opcao${escolhido === i.id ? ' marcada' : ''}`}>
                            <input type="radio" name="escolha-combo" checked={escolhido === i.id} onChange={() => escolher(i)} />
                            <span className="reacao-opcao-nome">{i.titulo}</span>
                            <span className="reacao-opcao-efeito">{i.detalhe}{i.buffs.length > 0 ? ` Buffs: ${i.buffs.map(descreverBuff).join('; ')}.` : ''}</span>
                        </label>
                    ))}
                </div>
                {item && (
                    <div className="combo-custo">
                        {item.permitidas.length > 1 ? (
                            <label>Pagar com <select className="input-neon" value={custo} onChange={(e) => setCusto(e.target.value)}>
                                {item.permitidas.map(a => <option key={a} value={a}>{ACOES_GOLPE.find(x => x.id === a).rotulo}</option>)}
                            </select></label>
                        ) : null}
                        <label><input type="checkbox" checked={gastar} onChange={(e) => setGastar(e.target.checked)} /> Gastar 1 {rotuloAcaoGolpe(custo)} agora (desmarque se já gastou)</label>
                    </div>
                )}
                <div className="reacao-botoes">
                    <button type="button" className="reacao-reagir" onClick={confirmar} disabled={!item}>🥋 CONFIRMAR</button>
                    <button type="button" className="reacao-recusar" onClick={recusar}>Foi um golpe comum</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
