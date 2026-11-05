module sync_fifo #(
  parameter DEPTH = 8,
  parameter WIDTH = 8
) (
  input  wire             clk,
  input  wire             rst,
  input  wire             wr_en,
  input  wire             rd_en,
  input  wire [WIDTH-1:0] din,
  output reg  [WIDTH-1:0] dout,
  output wire             full,
  output wire             empty
);
  reg [WIDTH-1:0] mem [0:DEPTH-1];
  reg [$clog2(DEPTH):0] count;

  always @(posedge clk) begin
    if (rst) count <= 0;
    else if (wr_en && !full) count <= count + 1;
    else if (rd_en && !empty) count <= count - 1;
  end

  assign full  = (count == DEPTH - 1);
  assign empty = (count == 0);

  always @(posedge clk) begin
    if (wr_en && !full) mem[count] <= din;
    if (rd_en && !empty) dout <= mem[0];
  end
endmodule
