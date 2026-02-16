import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';


function App() {
  const [childAge, setChildAge] = useState(7);
  const [monthlyPension, setMonthlyPension] = useState(1500);

  const [inflationAdjusted, setInflationAdjusted] = useState(false);

  // Constants
  const netRateAccumulation = 1.075; // 7.5% p.a.
  const netRateDecumulation = 1.03;  // 3.0% p.a.
  const inflationRate = 1.02; // 2.0% p.a.

  // Derived Calculation
  const { monthlyContribution, data, milestones } = useMemo(() => {
    // 0. Adjust Target Pension for Inflation if requested
    const targetPension = inflationAdjusted
      ? monthlyPension * Math.pow(inflationRate, 67 - childAge)
      : monthlyPension;

    // 1. Calculate Target Consumption Capital at 67
    // PV of annuity from 67 to 100 (33 years)
    // Rate per month
    const i2 = Math.pow(netRateDecumulation, 1 / 12) - 1;
    const monthsDecumulation = (100 - 67) * 12;
    // PV = PMT * (1 - (1+i)^-n) / i
    // Assuming end-of-month payout (Ordinary Annuity)
    const targetWealthAt67 = targetPension * (1 - Math.pow(1 + i2, -monthsDecumulation)) / i2;

    // 2. Calculate Required Monthly Contribution
    // FV of savings from childAge to 67
    // FV = C * ((1+i)^n - 1) / i * (1+i)  (Annuity Due - start of month)
    const i1 = Math.pow(netRateAccumulation, 1 / 12) - 1;
    const yearsAccumulation = 67 - childAge;
    const monthsAccumulation = yearsAccumulation * 12;

    let calcedContribution = 0;
    if (monthsAccumulation > 0) {
      // FV factor for annuity due
      const fvFactor = ((Math.pow(1 + i1, monthsAccumulation) - 1) / i1) * (1 + i1);
      calcedContribution = targetWealthAt67 / fvFactor;
    }

    // 3. Generate Data Points for Chart
    const dataPoints = [];
    let currentWealth = 0;

    const milestonesVals = {
      at18: 0,
      at25: 0,
      at40: 0,
      at67: targetWealthAt67 // Use the exact target
    };

    // Monthly Growth Factor for Accumulation
    const growthFactor = Math.pow(netRateAccumulation, 1 / 12);

    for (let age = childAge; age < 67; age++) {
      // Calculate 12 months
      for (let m = 0; m < 12; m++) {
        // Start of month contribution
        currentWealth += calcedContribution;
        // Growth
        currentWealth *= growthFactor;
      }

      const displayAge = age + 1;

      // Snapshot for milestones (End of Year)
      if (displayAge === 18) milestonesVals.at18 = currentWealth;
      if (displayAge === 25) milestonesVals.at25 = currentWealth;
      if (displayAge === 40) milestonesVals.at40 = currentWealth;
      // at67 is set at the end of loop/initialization

      dataPoints.push({
        age: displayAge,
        wealth: Math.round(currentWealth),
      });
    }

    // Fix milestone at 67 to be exactly the calculated target (avoid float drift in display)
    milestonesVals.at67 = currentWealth;

    return {
      monthlyContribution: calcedContribution,
      data: dataPoints,
      milestones: milestonesVals
    };
  }, [childAge, monthlyPension, inflationAdjusted]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="min-h-screen bg-white text-[#222] font-sans p-8 flex flex-col items-center">
      <header className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-[#8bbd2a] mb-6">Sparen für das Alter</h1>
        <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-8 text-lg font-medium text-gray-700">
          <p>
            Früh anfangen heißt: <span className="font-['Caveat'] text-3xl font-bold">Zukunft möglich machen.</span>
          </p>
        </div>
      </header>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-8">

          {/* Pension Slider */}
          <div className="bg-white p-[30px] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <label className="text-sm font-bold tracking-wider text-[#1a1a1a]">ZUSATZRENTE</label>
            </div>
            <div className="text-center mb-5">
              <span className="text-3xl font-bold text-[#8bbd2a]">{monthlyPension.toLocaleString('de-DE')} €</span>
            </div>
            <input
              type="range"
              min="300"
              max="3000"
              step="50"
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8bbd2a]"
              value={monthlyPension}
              onChange={(e) => setMonthlyPension(Number(e.target.value))}
            />
            <div className="flex justify-between mt-2 text-xs text-gray-300">
              <span>300 €</span><span>3.000 €</span>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <input
                type="checkbox"
                id="inflation"
                checked={inflationAdjusted}
                onChange={(e) => setInflationAdjusted(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-[#8bbd2a] focus:ring-[#8bbd2a]"
              />
              <label htmlFor="inflation" className="text-sm font-medium text-gray-700 select-none cursor-pointer">
                Inflation berücksichtigen (2% p.a.)
              </label>
            </div>
          </div>

          {/* Age Slider */}
          <div className="bg-white p-[30px] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <label className="text-sm font-bold tracking-wider text-[#1a1a1a]">SPAREN AB ALTER</label>
            </div>
            <div className="text-center mb-5">
              <span className="text-3xl font-bold text-[#8bbd2a]">{childAge} J.</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#8bbd2a]"
              value={childAge}
              onChange={(e) => setChildAge(Number(e.target.value))}
            />
            <div className="flex justify-between mt-2 text-xs text-gray-300">
              <span>0</span><span>50</span>
            </div>
          </div>

          {/* Contribution Display (formerly slider) */}
          <div className="bg-white p-[30px] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <label className="text-sm font-bold tracking-wider text-[#1a1a1a]">BENÖTIGTER SPARBEITRAG</label>
            </div>
            <div className="text-center mb-5">
              <span className="text-3xl font-bold text-[#8bbd2a]">{Math.round(monthlyContribution).toLocaleString('de-DE')} €</span>
            </div>
          </div>



        </div>

        {/* Right Column: Chart & Results */}
        <div className="lg:col-span-8 bg-white p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col h-[674px]">
          <div>
            <h3 className="text-center text-sm font-bold text-[#1a1a1a] mb-8 uppercase tracking-widest">Vermögen aufbauen</h3>

            <div className="h-[362px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8bbd2a" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8bbd2a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    dataKey="age"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#666', fontSize: 12 }}
                    ticks={[10, 20, 30, 40, 50, 60]}
                  />
                  <YAxis
                    width={100}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${value.toLocaleString('de-DE')} €`}
                    tick={{ fill: '#666', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value)}
                    labelFormatter={(label) => `Alter: ${label} Jahre`}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Area
                    type="linear"
                    dataKey="wealth"
                    stroke="#8bbd2a"
                    strokeWidth={3}
                    fill="url(#colorWealth)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Milestones */}
          <div className="mt-12">
            <h4 className="text-center text-gray-500 text-xs uppercase tracking-widest mb-4 font-semibold">Depotwert im Alter von ...</h4>
            <div className="grid grid-cols-4 gap-4">
              {[
                { age: 18, val: milestones.at18 },
                { age: 25, val: milestones.at25 },
                { age: 40, val: milestones.at40 },
                { age: 67, val: milestones.at67 }
              ].map((m, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 text-center flex flex-col justify-center h-full">
                  <div className="text-[#8bbd2a] font-bold text-lg md:text-xl truncate leading-none mb-1">
                    {formatCurrency(m.val).replace('€', '').trim()} €
                  </div>
                  <div className="text-gray-400 text-xs font-medium uppercase">
                    {m.age} Jahren
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-6">
              Annahme: Depotwert bis zum Alter von 100 Jahren aufgebraucht, Wertentwicklung netto 6%.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
