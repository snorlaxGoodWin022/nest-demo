// src/mcp-server/tools/weather.tool.ts

/**
 * 天气查询工具
 * 用于获取指定城市的实时天气信息
 *
 * 功能：
 * - 查询城市天气（温度、天气状况、湿度、风力）
 * - 支持多个热门城市
 *
 * 注意：当前为演示数据，生产环境可接入真实天气 API
 */

export async function handleWeatherQuery(args: any): Promise<string> {
  // 从参数中获取城市名称
  const { city } = args;

  // 实际项目接真实天气 API（如高德天气 API、和风天气 API）
  // const resp = await fetch(`https://restapi.amap.com/v3/weather/weatherInfo?city=${city}&key=${API_KEY}`)

  // 演示：使用模拟天气数据
  // 数据格式：城市名 -> { 温度, 天气状况, 湿度, 风力 }
  const weatherData: Record<
    string,
    { temp: number; weather: string; humidity: number; wind: string }
  > = {
    北京: { temp: 18, weather: '晴', humidity: 35, wind: '北风3级' },
    上海: { temp: 22, weather: '多云', humidity: 68, wind: '东南风2级' },
    武汉: { temp: 25, weather: '小雨', humidity: 78, wind: '东风1级' },
    广州: { temp: 28, weather: '晴', humidity: 72, wind: '南风2级' },
    深圳: { temp: 27, weather: '多云', humidity: 75, wind: '东南风2级' },
  };

  // 查找对应城市的天气数据
  const data = weatherData[city];

  // 如果城市不在支持列表中，返回提示信息
  if (!data) {
    return `暂不支持查询 ${city} 的天气，目前支持：北京、上海、武汉、广州、深圳`;
  }

  // 返回格式化的天气信息
  return `${city}实时天气：${data.weather}，温度 ${data.temp}°C，湿度 ${data.humidity}%，${data.wind}`;
}
