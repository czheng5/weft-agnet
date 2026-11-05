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
  reg [$clog2(DEPTH)-1:0] wr_ptr;
  reg [$clog2(DEPTH)-1:0] rd_ptr;

  assign full  = (count == DEPTH);
  assign empty = (count == 0);

  always @(posedge clk) begin
    if (rst) begin
      count  <= 0;
      wr_ptr <= 0;
      rd_ptr <= 0;
      dout   <= 0;
    end else begin
      if (wr_en && !full) begin
        mem[wr_ptr] <= din;
        wr_ptr <= wr_ptr + 1;
      end
      if (rd_en && !empty) begin
        dout <= mem[rd_ptr];
        rd_ptr <= rd_ptr + 1;
      end
      count <= count + ((wr_en && !full) ? 1 : 0) - ((rd_en && !empty) ? 1 : 0);
    end
  end
endmodule
