import React, { useContext, useEffect, useState } from 'react';
import { VoiceContext } from '../../hooks/VoiceContext';
import { PlayerDeAudioRemoto } from '../mapa/MapaVoz';
import { assinarVolumesVoz, idDeVoz, lerVolumeVoz } from '../../core/volumesVoz';
import { assinarConfig, fracaoVolumeVozes } from '../../core/configuracoes';

function PlayerDeUmJogador({ nome, stream, surdo, sinkId }) {
    const [volume, setVolume] = useState(() => lerVolumeVoz(nome));
    // Volume geral das vozes (Configurações): multiplica o volume de cada jogador.
    const [geral, setGeral] = useState(() => fracaoVolumeVozes());
    useEffect(() => assinarConfig(c => setGeral(fracaoVolumeVozes(c))), []);
    useEffect(() => {
        setVolume(lerVolumeVoz(nome));
        return assinarVolumesVoz((n, v) => { if (n === nome) setVolume(v); });
    }, [nome]);
    return <PlayerDeAudioRemoto stream={stream} volume={volume * geral} surdo={surdo} sinkId={sinkId} />;
}

// Toca a voz de todos na Sala da Party em qualquer aba do app (antes só tocava dentro do Mapa).
export default function AudioVozGlobal({ tavernaAtivos }) {
    const voz = useContext(VoiceContext);
    if (!voz || !Array.isArray(voz.conexoes)) return null;
    const nomes = Array.isArray(tavernaAtivos) ? tavernaAtivos : [];
    return (
        <>
            {voz.conexoes.filter(c => c && c.stream).map(c => {
                const nome = nomes.find(n => idDeVoz(n) === c.id) || c.id.replace(/^anime-rpg-/, '');
                return <PlayerDeUmJogador key={c.id} nome={nome} stream={c.stream} surdo={voz.surdo} sinkId={voz.selectedSpeaker} />;
            })}
        </>
    );
}
