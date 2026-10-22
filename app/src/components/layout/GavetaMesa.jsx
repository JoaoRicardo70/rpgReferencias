import React, { useMemo } from 'react';
import useStore from '../../stores/useStore';
import { listarDestinos } from '../../core/navegacao';
import { proximaLarguraGaveta, LARGURAS_GAVETA } from '../../core/modoNavegacao';

// 🗂️ Cabeçalho do painel lateral do modo "Mesa com painéis": mostra qual área está aberta ao lado do Mapa, deixa trocar a largura
// do painel (estreita / média / larga) e fechar (volta a ver só o Mapa). O conteúdo do painel é a própria aba (TabPanel com .painel-gaveta).
export default function GavetaMesa() {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);
    const larguraGaveta = useStore(s => s.larguraGaveta);
    const setLarguraGaveta = useStore(s => s.setLarguraGaveta);

    const destino = useMemo(() => listarDestinos({ isMestre }).find(d => d.id === abaAtiva), [isMestre, abaAtiva]);
    const rotuloLargura = (LARGURAS_GAVETA.find(l => l.id === larguraGaveta) || LARGURAS_GAVETA[1]).rotulo;

    return (
        <div className="gaveta-cabecalho">
            <span className="gaveta-titulo">{destino ? `${destino.icone} ${destino.nome}` : 'Painel'}</span>
            <button type="button" className="gaveta-botao" title="Mudar a largura do painel" onClick={() => setLarguraGaveta(proximaLarguraGaveta(larguraGaveta))}>↔ {rotuloLargura}</button>
            <button type="button" className="gaveta-botao gaveta-fechar" title="Fechar o painel (voltar ao Mapa)" aria-label="Fechar o painel" onClick={() => setAbaAtiva('aba-mapa')}>✖</button>
        </div>
    );
}
