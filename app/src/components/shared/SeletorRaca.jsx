import React, { useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { getRacas, resolverRaca } from '../../core/racas';
import BotaoCatalogoRacas from './BotaoCatalogoRacas';

// 🧬 Campo "Raça" das fichas (Ficha e Narrativa). Com catálogo de Raças na mesa (core/racas.js): seleção do catálogo + "Outra (texto livre)";
// sem catálogo: o mesmo campo de texto livre de sempre. O valor continua sendo o NOME da raça (ficha.bio.raca); o racaId é derivado ao salvar.
// Texto que não casa com nenhuma raça (nome ou apelido) é "Raça não cadastrada": sem acesso a Habilidades de Raça (não remove nada que já existe).
const VALOR_OUTRA = '__outra__';

// variante="ficha": visual herdado da página (transparente, borda inferior pontilhada), sem rótulo próprio nem input-neon (Ficha Definitiva).
// `dica` (opcional, variante ficha): linha curta mostrada sob o campo quando a raça escolhida está cadastrada.
export default function SeletorRaca({ valor, aoMudar, rotulo = 'Raça', desabilitado = false, variante = 'padrao', dica = '', mostrarCatalogo }) {
    const ficha = variante === 'ficha';
    const cenario = useStore(s => s.cenario);
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const [livre, setLivre] = useState(false);
    const texto = valor == null ? '' : String(valor);
    const casada = useMemo(() => resolverRaca(cenario, { bio: { raca: texto } }), [cenario, texto]);

    const linkCatalogo = <BotaoCatalogoRacas forcarVisivel={mostrarCatalogo} rotulo={ficha ? '⚙️ Catálogo de Raças' : '⚙️ Gerenciar catálogo de Raças'} className={ficha ? 'racas-seletor--ficha-link' : ''} />;
    const rotuloEl = ficha ? null : <label className="racas-seletor-rotulo">{rotulo}</label>;
    const classeCampo = ficha ? 'racas-seletor--ficha-campo' : 'input-neon';
    if (racas.length === 0) {
        if (ficha) return (
            <div className="racas-seletor racas-seletor--ficha"><input className={classeCampo} type="text" value={texto} aria-label={rotulo} disabled={desabilitado} onChange={e => aoMudar(e.target.value, { doCatalogo: false })} />{linkCatalogo}</div>
        );
        return (
            <div>{rotuloEl}<input className="input-neon" type="text" value={texto} aria-label={rotulo} disabled={desabilitado} onChange={e => aoMudar(e.target.value)} />{linkCatalogo}</div>
        );
    }
    const modoLivre = livre || (!casada.cadastrada && texto.trim() !== '');
    const selecionado = modoLivre ? VALOR_OUTRA : (casada.cadastrada ? casada.id : '');
    const escolher = (e) => {
        const v = e.target.value;
        if (v === VALOR_OUTRA) { setLivre(true); return; }
        setLivre(false);
        const raca = racas.find(r => r.id === v);
        aoMudar(raca ? raca.nome : '', { doCatalogo: true });
    };
    return (
        <div className={ficha ? 'racas-seletor racas-seletor--ficha' : 'racas-seletor'}>
            {rotuloEl}
            <select className={classeCampo} value={selecionado} aria-label={rotulo} disabled={desabilitado} onChange={escolher}>
                <option value="">Sem raça</option>
                {racas.map(r => <option key={r.id} value={r.id}>{r.icone} {r.nome}</option>)}
                <option value={VALOR_OUTRA}>Outra (texto livre)</option>
            </select>
            {linkCatalogo}
            {modoLivre && (
                <>
                    <input className={`${classeCampo} racas-seletor-livre`} type="text" value={texto} aria-label={`${rotulo} (texto livre)`} placeholder="Digite a raça" disabled={desabilitado}
                        onChange={e => { const t = e.target.value; aoMudar(t, { doCatalogo: false }); }} />
                    <p className="racas-nao-cadastrada" role="note">
                        {resolverRaca(cenario, { bio: { raca: texto } }).cadastrada ? 'Esta raça está cadastrada: escolha-a na lista.' : '⚠️ Raça não cadastrada — sem acesso a Habilidades de Raça'}
                    </p>
                </>
            )}
            {ficha && !modoLivre && casada.cadastrada && dica && <p className="racas-seletor--ficha-dica" role="note">{dica}</p>}
        </div>
    );
}
