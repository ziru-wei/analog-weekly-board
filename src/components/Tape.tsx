import { useEffect, useState, type CSSProperties } from 'react';
import { tapeTexture } from './tapeTexture';
import './Tape.css';
export function Tape() {
  const [texture, setTexture] = useState('');
  useEffect(() => { let mounted = true; tapeTexture().then(value => { if (mounted) setTexture(value); }).catch(() => {}); return () => { mounted = false; }; }, []);
  return <div style={texture ? { '--tape-texture': `url(${texture})` } as CSSProperties : undefined} className="tape-material" aria-hidden="true">
    <div className="contact-shadow" />
    {['top-a', 'top-b', 'bottom-a', 'bottom-b'].map(edge => <div key={edge} className={`edge-shadow ${edge}`} />)}
    <div className="left-fiber" /><div className="left-hairs" />
    <div className="tape"><div className="surface" />
      {['top-a', 'top-b', 'bottom-a'].map(edge => <div key={edge} className={`edge-lip ${edge}`} />)}
      <div className="contact-line top" /><div className="contact-line bottom" />
    </div>
  </div>;
}
