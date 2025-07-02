/**
 * Battery Profit Calculator Module with payback months, profitability check,
 * max power enforcement and toast notifications via Notyf,
 * enhanced D3 chart with cost line.
 */
import * as d3 from 'd3';

// default configuration
const DEFAULTS = {
    power:         4000,  // W
    yield:         3600,  // kWh/year (90% of power)
    self_old_pct:    30,  // % old self-consumption
    self_new_pct:    75,  // % new self-consumption
    price_kwh:     0.41,  // € per kWh
    install_cost: 4000,   // € installation cost
    price_inc:       4,   // % price increase per year
    lifespan:       12    // years
};

// maximum allowed power (W)
const MAX_POWER = 10000;

// color constants
const COLOR_PRIMARY   = '#006600';
const COLOR_ACCENT    = '#FFCC00';
const COLOR_NOT_PROF  = '#990000';

// round to 2 decimals
const rnd = v => Math.round(v * 100) / 100;

// collect inputs by id
const inputs = ['power','yield','self_old_pct','self_old','self_new_pct','self_new','profit','price_kwh','install_cost','price_inc','lifespan']
    .reduce((o,id) => { o[id] = document.getElementById(id); return o; }, {});

/** populate inputs with defaults */
function initDefaults() {
    Object.entries(DEFAULTS).forEach(([k,v]) => {
        if (inputs[k]) inputs[k].value = v;
    });
}

/**
 * Recalculate all fields, chart and table.
 * @param {string} changedId – the input id that triggered this update
 */
function update(changedId='') {
    // parse values
    let P   = +inputs.power.value || 0;
    let Y   = +inputs.yield.value || 0;
    let Sop = +inputs.self_old_pct.value || 0;
    let So  = +inputs.self_old.value || 0;
    let Snp = +inputs.self_new_pct.value || 0;
    let Sn  = +inputs.self_new.value || 0;
    const price     = +inputs.price_kwh.value   || 0;
    const installC  = +inputs.install_cost.value|| 0;
    const inc       = (+inputs.price_inc.value || 0) / 100;
    const life      = +inputs.lifespan.value    || 0;

    // enforce max power
    if (P > MAX_POWER) {
        notyf.error('Je hebt de maximale capaciteit van de installatie overschreden');
        P = MAX_POWER;
        inputs.power.value = rnd(P);
    }

    // sync yield <-> power
    if (changedId === 'power') {
        Y = P * 0.9;
        inputs.yield.value = rnd(Y);
    } else if (changedId === 'yield') {
        P = Y / 0.9;
        inputs.power.value = rnd(P);
    }

    // old self-consumption sync
    if (changedId === 'self_old_pct') {
        So = Y * Sop / 100;
        inputs.self_old.value = rnd(So);
    } else if (changedId === 'self_old') {
        Sop = So / Y * 100;
        inputs.self_old_pct.value = rnd(Sop);
    } else {
        So = Y * Sop / 100;
        inputs.self_old.value = rnd(So);
    }

    // new self-consumption sync
    if (changedId === 'self_new_pct') {
        Sn = Y * Snp / 100;
        inputs.self_new.value = rnd(Sn);
    } else if (changedId === 'self_new') {
        Snp = Sn / Y * 100;
        inputs.self_new_pct.value = rnd(Snp);
    } else {
        Sn = Y * Snp / 100;
        inputs.self_new.value = rnd(Sn);
    }

    // profit kWh/year
    const profitKwh = Sn - So;
    inputs.profit.value = rnd(profitKwh);

    // yearly profit in € for year 1
    const base = profitKwh * price - installC;
    const profitYearOne = base > 0 ? base : 0;
    // build data with year 0 start
    const dataYearly = [{ year: 0, priceKwh: price, yearly: profitYearOne, cumul: profitYearOne}];
    const dataMonthly = [{ month: 0, priceKwh: price, monthly: profitYearOne / 12,  cumul: profitYearOne / 12 }];

    let paybackExact = null;
    const month = 0;
    for (let y = 1; y <= life; y++) {
        const prevPriceKwh = dataYearly[y-1].priceKwh;
        const prevCumul = dataYearly[y-1].cumul;


        const newPriceKwh = prevPriceKwh * rnd(inc / 100); 

        base = newPriceKwh * profitKwh - installC;
        const profitYear = base > 0 ? base : 0;
        dataYearly.push({
            year: y,
            priceKwh: newPriceKwh,
            yearly: profitYear,
            cumul: prevCumul + profitYear,
            base: base
        });

        for (let i = 0; i >=11; i++){
            month += 1;
            prevMonthPrice = dataMonthly[month - 1].monthly;
            dataMonthly.push({
                month: month,
                priceKwh: newPriceKwh,
                monthly: profitYear / 12,
                cumul: prevMonthPrice + profitYear / 12,
                base: base / 12
            })
        }
    }
}

// if never profitable, totalProfit is negative
const totalProfit = cum - installC;

// text summary
const avgText = `Je spaart gemiddeld <strong>€${rnd(cum/12)}</strong> per jaar, over ${life} jaar.`;
const profitColor = isProfitable ? COLOR_PRIMARY : COLOR_NOT_PROF;
const totalText = `Je totale winst op de batterij is <strong style="color:${profitColor}">€${rnd(totalProfit)}</strong>.`;

let paybackText;
if (isProfitable && paybackExact != null) {
    const yrs = Math.floor(paybackExact);
    const mos = Math.round((paybackExact - yrs) * 12);
    paybackText = `Je batterij is terugbetaald na <strong>${yrs}</strong> jaar en <strong>${mos}</strong> maanden.`;
} else {
    paybackText = `Je batterij, is niet rendabel, vermogen te laag.`;
}

document.getElementById('text-div').innerHTML = `
    <p>${avgText}</p>
    <p>${paybackText}</p>
    <p>${totalText}</p>
  `;

// render chart and table
drawChart(dataMonthly, installC, paybackExact, isProfitable);
drawTable(dataTable, isProfitable);
}

/**
 * draw cumulative profit chart with D3
 */
function drawChart(data, installC, paybackExact, isProfitable) {
    const cont = d3.select('#chart-div');
    cont.selectAll('*').remove();
    const width  = cont.node().clientWidth;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const svg = cont.append('svg')
        .attr('width', width)
        .attr('height', height);

    // y domain includes install cost line
    const maxC = Math.max(d3.max(data, d => d.cumulative), installC);
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.year)])
        .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
        .domain([0, maxC]).nice()
        .range([height - margin.bottom, margin.top]);

    // area under cumulative curve
    svg.append('path')
        .datum(data)
        .attr('fill', COLOR_PRIMARY).attr('fill-opacity', 0.3)
        .attr('d', d3.area()
            .x(d => x(d.year))
            .y0(y(0))
            .y1(d => y(d.cumulative))
        );

    // cumulative line
    svg.append('path')
        .datum(data)
        .attr('fill','none').attr('stroke',COLOR_PRIMARY).attr('stroke-width',2)
        .attr('d', d3.line()
            .x(d => x(d.year))
            .y(d => y(d.cumulative))
        );

    // installation cost line
    svg.append('line')
        .attr('x1', x(0)).attr('x2', x(data[data.length-1].year))
        .attr('y1', y(installC)).attr('y2', y(installC))
        .attr('stroke', COLOR_ACCENT).attr('stroke-dasharray', '4 2').attr('stroke-width',2);
    svg.append('text')
        .attr('x', x(data[data.length-1].year)).attr('y', y(installC) - 5)
        .attr('fill', COLOR_ACCENT).attr('text-anchor','end')
        .text('Installatiekost');

    // axes
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(data.length).tickFormat(d3.format('d')));
    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

    // payback marker if profitable
    if (isProfitable && paybackExact != null) {
        svg.append('line')
            .attr('x1', x(paybackExact)).attr('x2', x(paybackExact))
            .attr('y1', y(0)).attr('y2', y(maxC))
            .attr('stroke', COLOR_ACCENT).attr('stroke-dasharray', '4 2').attr('stroke-width',2);
        svg.append('text')
            .attr('x', x(paybackExact)).attr('y', margin.top)
            .attr('fill', COLOR_ACCENT).attr('text-anchor','middle')
            .text(`Terugbetaald`);
    }
}

/**
 * render yearly profit table
 */
function drawTable(data, isProfitable) {
    const container = document.getElementById('table-div');
    let html = `<h3>Overzicht per jaar</h3>
    <table>
      <thead>
        <tr><th>Jaar</th><th>Jaarlijkse winst (€)</th><th>Cumulatieve winst (€)</th></tr>
      </thead><tbody>`;
    data.slice(1).forEach(d => {
        html += `
      <tr>
        <td>${d.year}</td>
        <td>${rnd(d.yearly)}</td>
        <td>${rnd(d.cumulative)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// attach input listeners
Object.keys(inputs).forEach(id => {
    inputs[id].addEventListener('input', () => update(id));
});

// initial render
initDefaults();
update();
