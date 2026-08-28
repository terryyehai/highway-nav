// DEV 專用：以 ?harness=<key> 直接渲染指定情境，跳過 GPS/reducer，供 Playwright 版面稽核使用。
import { HighwayDashboard } from '../components/HighwayDashboard';
import { SCENARIOS, scenarioRoutes } from './scenarios';

export function ScenarioHarness({ scenarioKey }: { scenarioKey: string }) {
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenario) {
    return (
      <div className="p-8 text-xl text-shield-red">
        找不到情境「{scenarioKey}」，可用：{SCENARIOS.map((s) => s.key).join(', ')}
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col bg-signboard" data-harness-ready="true">
      <HighwayDashboard
        state={scenario.state}
        geoError={scenario.geoError}
        routes={scenarioRoutes}
        onTopoSwitch={() => {}}
      />
    </div>
  );
}
