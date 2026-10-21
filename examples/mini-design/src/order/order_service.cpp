// 示例实现：用于演示断言核对（claims）能命中符号
#include <string>

struct Order {
  std::string id;
  std::string state;
};

class OrderService {
 public:
  bool Accept(const Order& order) {
    if (order.id.empty()) return false;
    return Save(order);
  }

 private:
  bool Save(const Order& order) {
    // 真实实现应写入 order_main
    return true;
  }
};
