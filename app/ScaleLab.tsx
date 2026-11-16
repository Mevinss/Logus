"use client";
import { useState } from "react";

export default function ScaleLab() {
  const [length, setLength] = useState(2);
  const [scale, setScale] = useState(50000);
  const km = (length * scale / 100000).toLocaleString("ru");
  return <details className="st-lab">
    <summary>Измерить маршрут на карте</summary>
    <div className="st-lab-controls">
      <label>Масштаб карты
        <select value={scale} onChange={e => setScale(Number(e.target.value))}>
          <option value={50000}>1 : 50 000</option>
          <option value={100000}>1 : 100 000</option>
        </select>
      </label>
      <label>Длина на карте · {length} см
        <input type="range" min="1" max="10" value={length}
          aria-valuetext={length + " сантиметров"} onChange={e => setLength(Number(e.target.value))}/>
      </label>
    </div>
    <output aria-live="polite"><strong>{km} км</strong> на местности</output>
    <p>{length} см × {scale.toLocaleString("ru")} = {(length * scale).toLocaleString("ru")} см</p>
  </details>;
}
